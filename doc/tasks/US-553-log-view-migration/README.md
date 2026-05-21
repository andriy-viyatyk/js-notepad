# US-553: LogView editor migration

EPIC-028 Phase C — fifth and final Tier 5 text-bearing editor migration. Promotes the legacy `LogViewModel` (a `ContentViewModel` over `TextFileModel`) to a native v4 `LogViewEditor` extending `EditorModel`. Retires the four `acquireViewModelSync("log-view")` consumer sites and their three async pre-load partners.

Walkthrough: [`doc/epics/EPIC-028-editor-architecture/walkthroughs/23-log-view.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/23-log-view.md). Concerns LV1–LV10 (with HS1 amendment to LV3).

## Goal

Replace the host + content-view pair (`TextFileModel` wrapped in `LegacyEditorAdapter` + `LogViewModel` acquired via `acquireViewModelSync`) with a single native `LogViewEditor` that IS the page's `mainEditor` and HAS a `TextFileModel` as its `IContentHost` via `CONTENT_HOST_TRAIT`. The four MCP / scripting consumer sites flip from VM-acquire to `editor instanceof LogViewEditor` direct access; `forceScrollVersion` retires in favor of a queue event; `itemsState` and `showTimestamps` ride the HS1 host slot (per the LV3 amendment) so they survive in-session editor switches AND app restarts.

## Background

### Reference shape — GridEditor (US-552)

`src/renderer/editors/grid/GridEditor.ts` is the canonical native-v4 text-bearing editor. LogView follows the same eight-piece template:

1. Class extends `V4EditorModel<XState, void, XQueueEvent>` with `readonly editorId`, `_host: TextFileModel | null`, subscription handles, and an HS1 mirror handle.
2. Constructor adds `CONTENT_HOST_TRAIT` with `extractContentHost` that tears down every subscription before returning the host.
3. `applyRestoreData` stashes `_pendingHost` and (per HS1) `_pendingLegacySettings` for one-shot promotion of pre-US-553 descriptors.
4. `switchFrom(oldEditor)` extracts the host via the trait, copies the editor id (cache-file continuity), calls `adoptHost`, then triggers an initial parse.
5. `restore()` either rebuilds the host from `_pendingHost` or constructs an empty one, calls `host.restore()`, then `adoptHost` and initial parse.
6. `adoptHost(host)` wires the host-state forwarder, the content subscription (re-parse on external content change), the HS1 promotion-then-seed-then-mirror dance, and the title sync.
7. `dispose()` tears down every subscription before disposing the host (only if not extracted).
8. Module file (`grid/index.tsx`) exports an `EditorModule` (`{ createEditor, Component }`) consumed by the v4 registry; `register-editors.ts` overrides the bare-adapter mirror with the native module via `v4EditorRegistry.register({ id, accepts, loadModule })`.

LogView reproduces this shape but adds three editor-specific mechanisms:

- **JSONL self-write loop** — editor mutators (`addEntry`, `updateEntryText`, …) serialize an entry to JSONL, set `skipNextContentUpdate = true`, then call `host.changeContent(newContent)`. The host-content subscription reads + resets the flag and skips re-parsing the editor's own echo. Per LV6, this stays editor-private (parallel mechanism to Grid's `_changedContent` re-entry guard).
- **Promise-based dialogs** — `addDialogEntry` returns `Promise<LogEntry>`; resolver stored in `pendingDialogs: Map<id, {resolve}>` until the user clicks a button (`resolveDialog`) or the editor disposes (sentinel resolve with empty entry). Per LV7, dispose cancels uniformly (page-close AND switch-out).
- **Append-only entry materialization** — full parse on initial restore (`loadContent`); incremental parse on content changes (`loadContentIncremental` — parses only new trailing lines if existing lines are unchanged). Per LV4, three lifecycle sites: `restore()` initial, `adoptHost` content subscription, `dispose()` cancel.

### HS1 amendment + size carve-out for LogView (LV2/LV3 supersession, 2026-05-22)

US-552-B introduced `host.getEditorState<T>(editorId)` / `host.setEditorState<T>(editorId, value)` on `IContentHost`, backed by a new `editorSettings: Record<string, unknown>` slot on `TextFileModel.state`. Each text-bearing editor reads its own slot via `this.editorId`, seeds editor state from it in `adoptHost`, and mirrors changes back via a `state.subscribe` mirror.

The walkthrough's original LV2/LV3 resolutions put both `itemsState` and `showTimestamps` in persisted state (LV3's first amendment moved them into the HS1 host slot). **US-553 investigation further amends this:** `itemsState` is NOT persisted — neither in `EditorDescriptor.state` nor in the host slot.

**Reason** (see also memory `feedback-hs1-size-considerations`): `itemsState` is `Record<entryId, Record<key, any>>` — per-log-entry aux state that scales with entry count. A heavy log page can carry thousands of entries. Putting that on the host slot means the entire blob rides `openFiles0.json` (per-window state file), which is rewritten on a 500ms debounce on every editor state change. Rapid `setItemState` mutations (e.g., column-width ResizeObserver updates across many entries) would dirty the host slot constantly, causing a write-storm and bloating the window-state file that boots read eagerly to render the tab strip.

**Resulting split:**

- `showTimestamps` (bounded boolean) → rides `host.editorSettings["log-view"]`. Survives Monaco↔LogView swaps AND app restarts. Small new feature vs. today (today's `LogViewModel.showTimestamps` is in-memory only — no persistence).
- `itemsState` (per-item, scales with entry count) → stays on `editor.state` for in-session reactivity only. NOT persisted. Resets on app restart. Resets on Monaco↔LogView switch (rare in practice).

Trade-off accepted: customized column orderings / focus on `output.grid` entries within a log page do not survive restart. Acceptable because:
1. The dominant LogView use case is well-known MCP pages where per-entry view customization is rare and short-lived (one MCP session).
2. The walkthrough's "~50KB per-page metadata budget" estimate for itemsState was correct in theory but ignored the write-storm angle.
3. Today's `LogViewModel` persists itemsState to a separate `<host.id>-log-view-items.json` cache file — even today, customizations on transient script-emitted log entries are short-lived; users haven't asked for cross-restart preservation of grid-entry column orderings.

**No legacy descriptor migration** needed: neither `showTimestamps` nor `itemsState` was on the `EditorDescriptor.state` shape today (`showTimestamps` was in-memory VM state; `itemsState` was in a separate cache file). The `<host.id>-log-view-items.json` files on disk become orphaned on upgrade per P9 (no-sweep) — same disposition as the GR4 amendment.

### Current state — files in scope

`src/renderer/editors/log-view/`:

| File | Today's role | After US-553 |
|------|--------------|--------------|
| `LogViewModel.ts` | `ContentViewModel<LogViewState>` over `TextFileModel` | **Deleted.** State + setters + private fields + JSONL parse + entry mutators absorb into `LogViewEditor.ts`. |
| `LogViewEditor.tsx` | React component, props `{ model: TextFileModel }`, uses `useContentViewModel<LogViewModel>` | **Renamed to `LogBody.tsx`.** Drops `useContentViewModel`; reads via `state.use` on `LogViewEditor`. Toolbar contributions migrate to inline `<TextChrome>` children. |
| (new) `LogViewEditor.ts` | — | Native v4 `LogViewEditor` class + state shape + queue event union + module exports. |
| (new) `index.tsx` | — | Module shell — `EditorModule` export (`logViewModule`), shared `LogViewEditorView` ({ TextChrome + LogToolbarBits + LogBody }), re-exports of class and types. |
| `LogViewContext.ts` | `LogViewModel` provider/consumer | Switch type to `LogViewEditor` (hook name stays `useLogViewModel` for consumer simplicity — internal-only type rename). |
| `LogEntryWrapper.tsx`, `LogMessageView.tsx`, `LogEntryContent.tsx`, `StyledTextView.tsx`, `items/*.tsx` (10 files) | Consume `LogViewModel` via `useLogViewModel()` | Verbatim — consume `LogViewEditor` via the renamed hook. Public methods (`addEntry`, `updateEntryById`, `resolveDialog`, `getItemState`, `setItemState`, `getEntryHeight`, `setEntryHeight`, `isDialogPending`) all preserved on `LogViewEditor`. |
| `logTypes.ts`, `logConstants.ts` | Type definitions, constants | Verbatim. |

### `acquireViewModelSync` callsites to retire (LV9 + MI4)

Four consumer sites + three pre-load sites:

| File | Line | Pattern today | After |
|------|------|---------------|-------|
| `src/renderer/api/mcp-handler.ts` | 233 | `textHost.acquireViewModelSync("log-view") as LogViewModel \| undefined` (in `getOrCreateMcpLogViewModel`) | `page.mainEditorV4 instanceof LogViewEditor` direct check |
| `src/renderer/api/mcp-handler.ts` | 269 | same (in `logIncomingRequest` inline) | same |
| `src/renderer/api/mcp-handler.ts` | 281 | same (in `showMcpRequestLog`) | same |
| `src/renderer/scripting/ScriptContext.ts` | 249 | `logEditor.acquireViewModelSync("log-view") as LogViewModel` + `releaseList.push(() => logEditor.releaseViewModel("log-view"))` | `editor instanceof LogViewEditor` direct; releaseList push deletes |
| `src/renderer/scripting/ScriptRunner.ts` | 108 | `await editorRegistry.loadViewModelFactory("log-view")` (pre-load) | **Delete.** |
| `src/renderer/scripting/AutoloadRunner.ts` | 98 | same | **Delete.** |
| `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` | 702 | same (in `showHistory`) | **Delete.** |

The `acquireViewModelSync` machinery itself does NOT die in this task — `NoteItemEditModel.ts:331` is still a consumer; the interface declaration at `editors/base/IContentHost.ts:61` and the `TextEditorModel.ts:81` implementation stay. Full removal happens in US-557 (NoteItemEditModel migration, walkthrough 29 / NB6) and US-559 (cleanup). LV9's "final retirement step" framing in the walkthrough is aspirational — it would be the final step IF Notebook migrated first, but the agreed task ordering moves Notebook to the end.

The three `loadViewModelFactory("log-view")` pre-loads are workarounds for the sync-acquire constraint; once LogView is its own EditorModel subclass nothing depends on the module being pre-loaded synchronously. The `editorRegistry.loadViewModelFactory` method itself (legacy registry path) stays — it serves other editors via `PagesLifecycleModel.requireWellKnownPage:299`.

### Open-file path — `wrapLegacyForPage`

`src/renderer/api/pages/PagesLifecycleModel.ts:53` (`wrapLegacyForPage`) is the bridge that converts legacy `TextFileModel` instances into v4 editors during page creation. Today it has two `if` branches (Monaco, Grid) that produce native v4 editors; everything else falls through to `LegacyEditorAdapter`. US-553 adds the LogView branch:

```typescript
if (isTextFile && targetEditorId === "log-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const logView = new LogViewEditor(
        new TComponentState({ ...defaultLogViewEditorState, id }),
    );
    logView.adoptHost(legacy as TextFileModel);
    const content = (legacy as TextFileModel).state.get().content ?? "";
    logView.loadContent(content);  // initial parse — mirrors restore() path
    return logView;
}
```

This makes:
- `pagesModel.addEditorPage("log-view", "jsonl", title)` produce a v4-native `LogViewEditor` as `page.mainEditorV4`.
- `pagesModel.requireWellKnownPage("mcp-ui-log")` / `requireWellKnownPage("mcp-server-log")` produce a v4-native `LogViewEditor`.

The legacy registry's `log-view` entry (`register-editors.ts:155`) keeps `editorType: "textFile"` so `editorRegistry.validateForLanguage("log-view", "jsonl")` still resolves correctly during page creation. The bare-adapter mirror in the v4 bridge loop (`register-editors.ts:730`) drops `"log-view"` from the bridge set — a native v4 registration replaces it (the same way `grid-json` / `grid-csv` / `grid-jsonl` are handled by US-552).

### Backwards compatibility — pre-US-553 session data

Today's session data:
- `<host.id>-host.txt` — JSONL content; cache-keyed by editor id. Survives across migration since the LogViewEditor inherits the host's id (C9). No content shape change.
- `<host.id>-log-view-items.json` — separate cache file written by today's `LogViewModel.saveItemsState`. After US-553 this file becomes orphaned. Per LV3 + P9 it gets collected when the page disposes (`fs.deleteCacheFiles(editor.id)` already runs); for well-known pages (`mcp-ui-log`, `mcp-server-log`) that never close, it lingers harmlessly forever.
- `EditorDescriptor` shape — today's log-view pages are persisted as `editor: "log-view"` + `type: "textFile"` (legacy adapter shape). After US-553 they save as `editorId: "log-view"` + a host descriptor (native v4 shape). v3 restore path (`PagesPersistenceModel.restoreV3` per the comment at `PagesLifecycleModel.ts:53`) auto-promotes pre-US-551 sessions by calling `wrapLegacyForPage` on the restored TextFileModel — the new LogView branch handles the promotion.

`itemsState` from old cache files is NOT migrated — the well-known log pages (`mcp-ui-log`, `mcp-server-log`) lose their saved per-entry aux state on first boot post-upgrade. Acceptable: itemsState is per-script-run aux state (column orderings on transient `output.grid` entries); the well-known log pages are typically full of one-off MCP-emitted entries that have no aux interactions yet.

For pages that DO carry pre-US-553 view-config (`showTimestamps` was implicit-default-false; `itemsState` was the JSON cache file), the one-shot legacy promotion in `applyRestoreData` reads any legacy fields off `data.state` and stashes them in `_pendingLegacySettings`. `adoptHost` then promotes them into `host.editorSettings["log-view"]` if the slot is empty (same pattern as Grid HS1).

## Implementation plan

### Step 1 — Create `src/renderer/editors/log-view/LogViewEditor.ts`

New file. Class skeleton mirrors `src/renderer/editors/grid/GridEditor.ts` with LogView-specific mechanisms substituted.

**State shape** (`LogViewEditorState`):

```typescript
import type { EditorStateBase } from "../base/v4/EditorModel";
import type { LogEntry } from "./logTypes";

export interface LogViewEditorState extends EditorStateBase {
    // HS1 — rides host.editorSettings["log-view"]. Bounded boolean, safe to persist.
    showTimestamps: boolean;
    // Per-item — present on state for in-session reactivity but NOT persisted
    // (neither on descriptor nor host slot). Resets on restart and on
    // Monaco↔LogView switch. See HS1 amendment in Background — size scales
    // with entry count; persistence would write-storm openFiles0.json.
    itemsState: Record<string, Record<string, any>>;
    // View-derived — present on state for reactive read; stripped from getRestoreData
    // per MO5 / GR8 pattern. Recomputed from host content on restore.
    entries: LogEntry[];
    entryCount: number;
    error: string | undefined;
}

export const defaultLogViewEditorState: LogViewEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    showTimestamps: false,
    itemsState: {},
    entries: [],
    entryCount: 0,
    error: undefined,
};
```

**Queue event union** (LV5 + LV8):

```typescript
export type LogQueueEvent =
    | { type: "focus" }            // MO7 — chrome's root-focus signal
    | { type: "scrollToBottom" };  // LV5 — replaces forceScrollVersion

export type LogQueueRequest = never;  // LV9 — all UiFacade reads are sync against editor.state
```

**Class structure**:

```typescript
export class LogViewEditor extends V4EditorModel<LogViewEditorState, void, LogQueueEvent> {
    readonly editorId = "log-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // LogView-specific private fields (verbatim from today's LogViewModel):
    private pendingDialogs = new Map<string, { resolve: (result: LogEntry) => void }>();
    private nextId = 1;
    private skipNextContentUpdate = false;
    private lastLineCount = 0;
    private heightCache = new Map<string, number>();
    private dirtyIndices = new Set<number>();

    readonly typedQueue: ComponentQueue<LogQueueEvent, LogQueueRequest>;

    constructor(state: TComponentState<LogViewEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<LogQueueEvent, LogQueueRequest>;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from LogViewEditor");
                this._hostStateUnsub?.();
                this._hostContentUnsub?.();
                this._settingsUnsub?.();
                this._hostStateUnsub = null;
                this._hostContentUnsub = null;
                this._settingsUnsub = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ─────────────────────────────────────────────────

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
        if (!pipe && !filePath) return null;
        return { pipe, filePath };
    }

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    // ── Persistence ─────────────────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // HS1 — descriptor collapses to identity-only. showTimestamps +
        // itemsState ride host.editorSettings["log-view"]; entries / entryCount
        // / error are view-derived (stripped per GR8 / MO5).
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

    applyRestoreData(data: RestoreData<LogViewEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined) cur.title = data.title;
            if (data.modified !== undefined) cur.modified = data.modified;
            if (data.secondaryEditor !== undefined) cur.secondaryEditor = data.secondaryEditor;
        });
        // No legacy promotion needed — today's LogViewModel doesn't persist
        // showTimestamps (in-memory only) and itemsState lived in a separate
        // cache file (orphaned on upgrade per P9). `adoptHost` seeds
        // showTimestamps from the host slot on first read; itemsState
        // intentionally resets.
        if (data.host) this._pendingHost = data.host;
    }

    // ── Lifecycle ───────────────────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void {
        const trait = oldEditor.traits.get(CONTENT_HOST_TRAIT);
        if (!trait) {
            throw new Error(`LogViewEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`);
        }
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if ((host as unknown as { type?: string })?.type !== "textFile") {
            throw new Error("LogViewEditor.switchFrom: extracted host is not a TextFileModel");
        }
        this.state.update((s) => { s.id = oldEditor.id; });
        host.state.update((s) => { s.editor = this.editorId; });
        this.adoptHost(host);
        // Initial parse of JSONL content (LV4 — same shape as GR7's CSV detect+parse path).
        this.loadContent(host.state.get().content ?? "");
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
            this.loadContent(this._host.state.get().content ?? "");
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Log View editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();

        // Forward host metadata changes to descriptorChanged (P3 debounce).
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send(undefined));

        // LV4 + LV6 — re-parse incrementally on external content changes;
        // skipNextContentUpdate guards against the editor's own self-writes.
        this._hostContentUnsub = host.state.subscribe(
            (content) => {
                if (this.skipNextContentUpdate) {
                    this.skipNextContentUpdate = false;
                    return;
                }
                this.loadContentIncremental(content as string);
            },
            (s) => s.content,
        );

        // HS1 — seed `showTimestamps` from host slot (sync, no flicker).
        // `itemsState` is intentionally NOT seeded — it's transient per the
        // size carve-out (see Background HS1 amendment).
        const saved = host.getEditorState<LogViewSettings>(this.editorId);
        if (saved?.showTimestamps !== undefined) {
            this.state.update((s) => { s.showTimestamps = saved.showTimestamps!; });
        }

        // HS1 — mirror `showTimestamps` changes back to host slot via a
        // selector subscription. Slice-subscribe keeps the mirror from firing
        // on `itemsState` mutations (the dominant write source on log pages)
        // — only the bounded boolean actually triggers a host-slot write.
        this._settingsUnsub = this.state.subscribe(
            (showTimestamps) => {
                if (!this._host) return;
                this._host.setEditorState<LogViewSettings>(this.editorId, {
                    showTimestamps: showTimestamps as boolean,
                });
            },
            (s) => s.showTimestamps,
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
    }

    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── JSONL parse — verbatim port of LogViewModel.loadContent / loadContentIncremental ──

    loadContent(content: string): void { /* verbatim from LogViewModel.ts:86-127 */ }
    private loadContentIncremental(content: string): void { /* verbatim from LogViewModel.ts:129-206 */ }
    private appendToContent(entry: LogEntry): void { /* verbatim from LogViewModel.ts:349-358 */ }
    private updateEntryInContent(entry: LogEntry): void { /* verbatim from LogViewModel.ts:360-385 */ }
    private flushDirtyDebounced = debounce(() => { /* verbatim from LogViewModel.ts:387-420 */ }, 300);

    // ── Entry mutators — verbatim port of public API (LV9 — MI6 confirmation) ──

    addEntry(type: string, fields: any): LogEntry { /* verbatim from LogViewModel.ts:213-251 */ }

    addDialogEntry(type: string, fields: Record<string, any>): Promise<LogEntry> {
        const entry = this.addEntry(type, fields);
        // LV5 — replaces today's forceScrollVersion bump.
        this.typedQueue.send({ type: "scrollToBottom" });
        return new Promise<LogEntry>((resolve) => {
            this.pendingDialogs.set(entry.id, { resolve });
        });
    }

    resolveDialog(id: string, button: string): void { /* verbatim from LogViewModel.ts:266-286 */ }
    updateEntryText(id: string, text: any): void { /* verbatim from LogViewModel.ts:292-305 */ }
    updateEntryAt(index: number, updater: (draft: LogEntry) => void): void { /* verbatim from LogViewModel.ts:307-314 */ }
    updateEntryById(id: string, updater: (draft: LogEntry) => void): void { /* verbatim from LogViewModel.ts:316-322 */ }

    clear = (): void => {
        // Cancel all pending dialogs.
        for (const [id, { resolve }] of this.pendingDialogs.entries()) {
            resolve({ type: "", id, timestamp: 0 });
        }
        this.pendingDialogs.clear();

        this.nextId = 1;
        this.lastLineCount = 0;

        this.state.update((s) => {
            s.entries = [];
            s.entryCount = 0;
            s.error = undefined;
        });

        this.skipNextContentUpdate = true;
        this._host?.changeContent("");
    };

    toggleTimestamps = (): void => {
        this.state.update((s) => { s.showTimestamps = !s.showTimestamps; });
    };

    // ── Queries ─────────────────────────────────────────────────────────

    isDialogPending(id: string): boolean {
        return this.pendingDialogs.has(id);
    }

    get entryCount(): number {
        return this.state.get().entryCount;
    }

    // ── Height cache (view virtualization — preserves across remounts) ──

    getEntryHeight(id: string): number | undefined {
        return this.heightCache.get(id);
    }
    setEntryHeight(id: string, height: number): void {
        this.heightCache.set(id, height);
    }

    // ── Per-item auxiliary state ────────────────────────────────────────

    getItemState(id: string): Record<string, any> {
        return this.state.get().itemsState[id] ?? {};
    }
    setItemState(id: string, patch: Record<string, any>): void {
        this.state.update((s) => {
            s.itemsState[id] = { ...s.itemsState[id], ...patch };
        });
        // No persistence — itemsState is transient in-session reactive state
        // per the HS1 size carve-out (Background). The state mutation here
        // still fires `descriptorChanged` (via the base auto-sub in
        // EditorModel constructor), but since `itemsState` isn't in
        // `getRestoreData()`'s output and the HS1 mirror only subscribes
        // to the `showTimestamps` slice, no openFiles0.json write happens.
    }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // LV7 — cancel pending dialogs (sentinel resolve; preserved from today's onDispose).
        for (const [id, { resolve }] of this.pendingDialogs.entries()) {
            resolve({ type: "", id, timestamp: 0 });
        }
        this.pendingDialogs.clear();
        this.dirtyIndices.clear();

        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}

/**
 * HS1 host-slot shape — only the bounded `showTimestamps` flag rides here.
 * `itemsState` is intentionally NOT in this shape (see Background HS1 amendment
 * — per-entry aux state would write-storm openFiles0.json).
 */
interface LogViewSettings {
    showTimestamps?: boolean;
}
```

Imports follow GridEditor's structure: `V4EditorModel` / `EditorStateBase` / `RestoreData` from `../base/v4/EditorModel`; `CONTENT_HOST_TRAIT` / `IContentHostTrait` from `../base/v4/editor-traits`; `IContentHost` from `../base/v4/IContentHost`; `ComponentQueue` from `../../core/state/ComponentQueue`; `EditorDescriptor` / `HostDescriptor` from `../../../shared/persistence-v4`; `IContentPipe` from `../../api/types/io.pipe`; `PageModel` from `../../api/pages/PageModel` (type-only); `TextFileModel` / `newTextFileModel` from `../text/TextEditorModel`; `editorRegistry as v4Registry` from `../base/v4/editorRegistry`; `fpBasename` from `../../core/utils/file-path`; `ui` from `../../api/ui`; `debounce` from `../../../shared/utils`; `parseObject` from `../../core/utils/parse-utils` (if `loadContentIncremental` needs it).

### Step 2 — Create `src/renderer/editors/log-view/index.tsx`

New file. EditorModule shell:

```typescript
import { TComponentState } from "../../core/state/state";
import { LogViewEditor, defaultLogViewEditorState } from "./LogViewEditor";
import { LogBody } from "./LogBody";
import { TextChrome } from "../base/v4/TextChrome";
import { IconButton } from "../../uikit";
import { showConfirmationDialog } from "../../ui/dialogs/ConfirmationDialog";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

function TimestampIcon({ active }: { active: boolean }) { /* moved from today's LogViewEditor.tsx:28-35 */ }
function ClearIcon() { /* moved from today's LogViewEditor.tsx:37-43 */ }

function LogToolbarBits({ model }: { model: LogViewEditor }) {
    const showTimestamps = model.state.use((s) => s.showTimestamps);
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
                icon={<TimestampIcon active={showTimestamps} />}
                title={showTimestamps ? "Hide timestamps" : "Show timestamps"}
                onClick={model.toggleTimestamps}
            />
        </>
    );
}

function LogViewEditorView({ model }: { model: V4EditorModel }) {
    return (
        <TextChrome
            model={model}
            toolbarContributions={<LogToolbarBits model={model as LogViewEditor} />}
        >
            <LogBody model={model as LogViewEditor} />
        </TextChrome>
    );
}

export const logViewModule: EditorModule = {
    createEditor: () =>
        new LogViewEditor(new TComponentState({ ...defaultLogViewEditorState })),
    Component: LogViewEditorView,
};

export { LogViewEditor, defaultLogViewEditorState };
export type { LogViewEditorState, LogQueueEvent } from "./LogViewEditor";
```

`TextChrome`'s `toolbarContributions` prop is the contract that walkthroughs 09 / 10 set; verify the prop name matches what `src/renderer/editors/base/v4/TextChrome.tsx` actually accepts (if it's called something else, e.g., `toolbarChildren`, follow the actual signature — the chrome shipped in US-549).

### Step 3 — Create `src/renderer/editors/log-view/LogBody.tsx`

New file replacing today's `LogViewEditor.tsx`. Drops the `useContentViewModel` + portal-toolbar machinery; keeps the auto-scroll + RenderFlexGrid render verbatim.

```typescript
import { useCallback, useEffect, useRef } from "react";
import type { LogViewEditor } from "./LogViewEditor";
import { LogViewProvider } from "./LogViewContext";
import { LogEntryWrapper } from "./LogEntryWrapper";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import { Panel, Text } from "../../uikit";
import { EditorError } from "../base/EditorError";

const RIGHT_GUTTER = 40;
const getColumnWidth = (col: number) => col === 0 ? "100%" as Percent : RIGHT_GUTTER;
const AUTO_SCROLL_THRESHOLD = 50;

export function LogBody({ model }: { model: LogViewEditor }) {
    const state = model.state.use((s) => ({
        entries: s.entries,
        entryCount: s.entryCount,
        error: s.error,
        showTimestamps: s.showTimestamps,
    }));

    const gridModelRef = useRef<RenderGridModel | null>(null);
    const isAtBottom = useRef(true);
    const prevEntryCount = useRef(0);
    const scrollTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

    const setGridModel = useCallback((m: RenderGridModel | null) => {
        gridModelRef.current = m;
    }, []);

    const handleScroll = useCallback(() => {
        const container = gridModelRef.current?.containerRef?.current;
        if (!container) return;
        isAtBottom.current =
            container.scrollTop + container.clientHeight >= container.scrollHeight - AUTO_SCROLL_THRESHOLD;
    }, []);

    useEffect(() => {
        const container = gridModelRef.current?.containerRef?.current;
        if (!container) return;
        container.addEventListener("scroll", handleScroll, { passive: true });
        return () => container.removeEventListener("scroll", handleScroll);
    }, [state.entryCount, handleScroll]);

    const scheduleScrollToBottom = useCallback(() => {
        for (const t of scrollTimers.current) clearTimeout(t);
        const count = prevEntryCount.current;
        if (count <= 0) return;
        const scrollToEnd = () => gridModelRef.current?.scrollToRow(count - 1, "bottom");
        scrollToEnd();
        scrollTimers.current = [
            setTimeout(scrollToEnd, 50),
            setTimeout(scrollToEnd, 150),
            setTimeout(scrollToEnd, 300),
        ];
    }, []);

    // LV5 — queue-driven scroll + focus (replaces forceScrollVersion useEffect).
    model.queue.use((ev) => {
        if (ev.type === "focus") {
            gridModelRef.current?.containerRef?.current?.focus();
        } else if (ev.type === "scrollToBottom") {
            scheduleScrollToBottom();
        }
    });

    useEffect(() => {
        const count = state.entryCount;
        for (const t of scrollTimers.current) clearTimeout(t);
        scrollTimers.current = [];
        gridModelRef.current?.update({ all: true });
        if (count > prevEntryCount.current && isAtBottom.current && count > 0) {
            prevEntryCount.current = count;
            scheduleScrollToBottom();
        } else {
            prevEntryCount.current = count;
        }
        return () => {
            for (const t of scrollTimers.current) clearTimeout(t);
            scrollTimers.current = [];
        };
    }, [state.entryCount, scheduleScrollToBottom]);

    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [state.showTimestamps]);

    const renderLogEntry = useCallback(
        (p: RenderFlexCellParams) => {
            if (p.col === 1) return null;
            return (
                <LogEntryWrapper
                    vm={model}
                    index={p.row}
                    cellRef={p.ref}
                    showTimestamp={state.showTimestamps}
                />
            );
        },
        [model, state.showTimestamps],
    );

    const getInitialRowHeight = useCallback(
        (row: number) => {
            const entry = model.state.get().entries[row];
            return entry ? model.getEntryHeight(entry.id) : undefined;
        },
        [model],
    );

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
```

Note: `LogEntryWrapper`'s prop name is still `vm: LogViewModel` today; verify in step 5 whether to keep `vm` (rename only the type) or rename to `editor` for symmetry. Pick whichever produces the smaller diff — likely keep `vm` since the children wrappers also reference `.vm.`.

### Step 4 — Update `src/renderer/editors/log-view/LogViewContext.ts`

Switch the context type from `LogViewModel` to `LogViewEditor`. Hook name stays the same (the consumers don't care about the internal type rename; type-only change).

```typescript
import { createContext, useContext } from "react";
import type { LogViewEditor } from "./LogViewEditor";

const LogViewContext = createContext<LogViewEditor | null>(null);

export const LogViewProvider = LogViewContext.Provider;

export function useLogViewModel(): LogViewEditor {
    const vm = useContext(LogViewContext);
    if (!vm) throw new Error("LogViewContext not provided");
    return vm;
}
```

### Step 5 — Update all child views (`LogEntryWrapper.tsx`, `LogMessageView.tsx`, `LogEntryContent.tsx`, `StyledTextView.tsx`, `items/*.tsx`)

Each file imports `LogViewModel` from `./LogViewModel` (or `./LogViewContext`); replace with `LogViewEditor` from `./LogViewEditor`. Method calls preserved verbatim per LV9's API surface guarantee — the editor exposes the same `addEntry / addDialogEntry / updateEntryText / updateEntryById / resolveDialog / getItemState / setItemState / getEntryHeight / setEntryHeight / isDialogPending / state` surface.

If the prop name `vm: LogViewModel` appears in JSX-call signatures, change the type to `vm: LogViewEditor` but keep the name — keeps the diff small.

Files to update (10 + 1):
- `LogEntryWrapper.tsx`
- `LogMessageView.tsx`
- `LogEntryContent.tsx`
- `StyledTextView.tsx`
- `items/ButtonsDialogView.tsx`
- `items/ConfirmDialogView.tsx`
- `items/TextInputDialogView.tsx`
- `items/CheckboxesDialogView.tsx`
- `items/RadioboxesDialogView.tsx`
- `items/SelectDialogView.tsx`
- `items/GridOutputView.tsx`
- (other `items/*.tsx` — verify; the wrapper / dialog / output views all consume the VM)

### Step 6 — Delete `src/renderer/editors/log-view/LogViewModel.ts` and today's `LogViewEditor.tsx`

After steps 1–5 there are no consumers left:
- View consumers → switched to `LogViewEditor` via the renamed context.
- Scripting consumers (`UiFacade` + wrapper classes) → step 8 below.
- MCP / ScriptContext consumers → step 9 below.

Confirm with `grep -r "LogViewModel" src/` returns no hits before deleting. Today's `LogViewEditor.tsx` (the React component file) renames to `LogBody.tsx` per step 3 — same `git mv` if convenient.

### Step 7 — Update `src/renderer/editors/register-editors.ts`

Two changes:

**Change 1** — drop `"log-view"` from the bare-adapter bridge set (line 730):

```typescript
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
    // grid-* removed — US-552 ships native v4 modules
    // log-view removed — US-553 ships native v4 module (see below)
    "md-view",
    "mermaid-view",
    // ... (rest unchanged)
]);
```

**Change 2** — add native v4 registration override after the `grid-jsonl` block (line 849):

```typescript
// US-553 — replace the legacy bare-adapter mirror for log-view with a native v4
// module. Mirrors the US-552 grid-* pattern.
v4EditorRegistry.register({
    id: "log-view",
    name: "Log View",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("log-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        // Content-peek fallback (LV10) — also delegate to legacy.
        if (input.language && input.host) {
            const content = (input.host.state.get() as { content?: string }).content ?? "";
            if (legacy.isEditorContent?.(input.language, content)) return 60;
        }
        return -1;
    },
    loadModule: async () => {
        const { logViewModule } = await import("./log-view");
        return logViewModule;
    },
});
```

Optional — delete the now-dead legacy `loadModule` entry for `log-view` in `editorRegistry.register({ id: "log-view", ... })` at line 155, since v4 consumers reach the module via `v4EditorRegistry` and the legacy `loadModule` field is only consumed by the bare-adapter bridge (which no longer fires for log-view) and by `requireWellKnownPage`'s `loadViewModelFactory` call (which we keep delegating through the legacy registry for editor-type lookup, but the loadModule body becomes vestigial). Safer to keep the legacy entry's `loadModule` as a stub that imports nothing — leaving it as is risks an extra dynamic import on first well-known-log-page creation but doesn't break anything. Decision: keep legacy entry verbatim except change `loadModule` to return `textEditorModule` (drop the `Editor` and `createViewModel` fields since both LogView consumers retire). Cosmetic; doesn't affect correctness.

### Step 8 — Update `wrapLegacyForPage` in `src/renderer/api/pages/PagesLifecycleModel.ts`

Insert a new branch after the Grid branch (line 96) and before the `LegacyEditorAdapter` fallback:

```typescript
if (isTextFile && targetEditorId === "log-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const logView = new LogViewEditor(
        new TComponentState({ ...defaultLogViewEditorState, id }),
    );
    logView.adoptHost(legacy as TextFileModel);
    // Initial parse — open-file callers have already invoked legacy.restore(),
    // so we trigger loadContent inline (mirrors the GridEditor switchFrom path
    // and what GridEditor.restore() does on the session-restore path).
    const content = (legacy as TextFileModel).state.get().content ?? "";
    logView.loadContent(content);
    return logView;
}
```

Add imports at the top:

```typescript
import { LogViewEditor, defaultLogViewEditorState } from "../../editors/log-view";
```

### Step 9 — Update `src/renderer/api/mcp-handler.ts`

Three changes (one per callsite). Verify `mainEditorV4` is the right surface to read — yes, per `getActivePage` at line 122 it's the v4 surface; `instanceof LogViewEditor` works against it.

**Change 1** — `getOrCreateMcpLogViewModel` (line 228), rename to `getOrCreateMcpLogViewEditor`:

```typescript
import type { LogViewEditor } from "../editors/log-view";
// (remove the `import type { LogViewModel }` at line 8)

async function getOrCreateMcpLogViewEditor(): Promise<LogViewEditor> {
    const page = await pagesModel.requireWellKnownPage(MCP_UI_LOG_ID);
    const editor = page.mainEditorV4;
    if (!editor || !(editor instanceof LogViewEditor)) {
        throw new Error("MCP log page is not a LogViewEditor");
    }
    return editor;
}
```

**Change 2** — `logIncomingRequest` inline check (line 265):

```typescript
const logPage = pagesModel.findPage("mcp-server-log");
const logEditor = logPage?.mainEditorV4;
if (logEditor instanceof LogViewEditor) {
    logEditor.addEntry("output.mcp-request", requestHistory[requestHistory.length - 1]);
}
```

**Change 3** — `showMcpRequestLog` (line 275):

```typescript
export async function showMcpRequestLog(): Promise<void> {
    const page = await pagesModel.requireWellKnownPage("mcp-server-log");
    const editor = page.mainEditorV4;
    if (!(editor instanceof LogViewEditor)) return;
    if (editor.entryCount === 0 && requestHistory.length > 0) {
        for (const entry of requestHistory) {
            editor.addEntry("output.mcp-request", entry);
        }
    }
}
```

Also rename the `vm` local in `handleUiPush` (line 301) to `editor` for clarity (`const editor = await getOrCreateMcpLogViewEditor()`), and the chained `vm.addEntry / vm.addDialogEntry` calls follow.

### Step 10 — Update `src/renderer/scripting/ScriptContext.ts`

Edit `initializeUiFacade` (line 206-269). Drop the `acquireViewModelSync` + `releaseList.push` lines; use `instanceof LogViewEditor` to detect the existing log page; pass the editor directly to `new UiFacade(...)`.

```typescript
import { LogViewEditor } from "../editors/log-view";
// (remove the `import type { LogViewModel }` at line 9)
// (remove `import { isTextFileModel } from "../editors/text/TextEditorModel"` if no other use remains)

function initializeUiFacade(
    page: EditorModel | undefined,
    releaseList: Array<() => void>,
    outputFlags: ScriptOutputFlags,
    isMcp = false,
): { facade: UiFacade; pageId: string } {
    let logEditor: V4EditorModel;
    let logPageId: string;
    let isExisting = false;

    if (isMcp) {
        const existing = pagesModel.findPage("mcp-ui-log");
        if (existing?.mainEditorV4 instanceof LogViewEditor) {
            logEditor = existing.mainEditorV4;
            logPageId = existing.id;
            isExisting = true;
        } else {
            const newPage = pagesModel.addEditorPage("log-view", "jsonl", "MCP Log");
            logEditor = newPage.mainEditorV4!;
            logPageId = newPage.id;
        }
    } else if (page) {
        const pageId = page.page?.id ?? page.id;
        const grouped = pagesModel.getGroupedPage(pageId);
        if (grouped?.mainEditorV4 instanceof LogViewEditor) {
            logEditor = grouped.mainEditorV4;
            logPageId = grouped.id;
            isExisting = true;
        } else {
            const newPage = pagesModel.addEditorPage("log-view", "jsonl", formatLogTitle());
            logEditor = newPage.mainEditorV4!;
            logPageId = newPage.id;
            pagesModel.groupTabs(pageId, logPageId, false);
        }
    } else {
        const newPage = pagesModel.addEditorPage("log-view", "jsonl", formatLogTitle());
        logEditor = newPage.mainEditorV4!;
        logPageId = newPage.id;
    }

    if (!(logEditor instanceof LogViewEditor)) {
        throw new Error("Log view page is not a LogViewEditor. This is an internal error.");
    }

    // acquireViewModelSync + releaseList.push retire entirely (SF2 + LV9 partial).

    outputFlags.groupedContentWritten = true;

    if (isExisting) {
        logEditor.addEntry("log.info", "");
    }
    if (isMcp) {
        logEditor.addEntry("log.info", "Agent started script");
    } else {
        logEditor.addEntry("log.info", `Script ${page?.title ?? "untitled"} started`);
    }

    return { facade: new UiFacade(logEditor), pageId: logPageId };
}
```

Note: `pagesModel.addEditorPage(...)` stays sync — EW2's async transition is not in scope here.

The `EditorModel` import at line 1 stays (used for the `page` parameter type). Verify `V4EditorModel` import path — likely `import type { EditorModel as V4EditorModel } from "../editors/base/v4/EditorModel"`. If `V4EditorModel` is already imported nearby for `getGroupedPage` callers, reuse.

### Step 11 — Update `src/renderer/scripting/api-wrapper/UiFacade.ts`

Constructor parameter rename — `vm: LogViewModel` → `editor: LogViewEditor`. The class body's `this.vm.X` calls all become `this.editor.X`. Mechanical type-rename.

```typescript
import type { LogViewEditor } from "../../editors/log-view";
// (remove `import type { LogViewModel }` at line 1)

export class UiFacade {
    constructor(private readonly editor: LogViewEditor) {}

    // ... all `this.vm` references become `this.editor`
}
```

Also update the wrapper class constructors in `Progress.ts`, `Grid.ts`, `Text.ts`, `Markdown.ts`, `Mermaid.ts`, `StyledTextBuilder.ts` — each takes a `vm: LogViewModel` parameter today; rename type to `LogViewEditor` (parameter name can stay `vm` if call sites depend on it — pure type rename, no behavior change).

### Step 12 — Drop pre-load lines

Delete one line each:

| File | Line | Delete |
|------|------|--------|
| `src/renderer/scripting/ScriptRunner.ts` | 107-108 (incl. preceding comment) | `// Pre-load log-view module so UiFacade can create VM synchronously` + `await editorRegistry.loadViewModelFactory("log-view");` |
| `src/renderer/scripting/AutoloadRunner.ts` | 96-98 (incl. preceding comment) | Same comment + `await editorRegistry.loadViewModelFactory("log-view");` |
| `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` | 702 | `await editorRegistry.loadViewModelFactory("log-view");` |

If the `editorRegistry` import becomes unused in `AutoloadRunner.ts` after the deletion, drop the import. The `editorRegistry.loadViewModelFactory` method itself stays for other callers.

### Step 13 — Acceptance testing

Boot the app and verify each scenario in the Acceptance criteria section below.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/editors/log-view/LogViewEditor.ts` | **NEW** — native v4 editor class |
| `src/renderer/editors/log-view/index.tsx` | **NEW** — module shell, view + toolbar contributions |
| `src/renderer/editors/log-view/LogBody.tsx` | **NEW** — body component (replaces today's LogViewEditor.tsx) |
| `src/renderer/editors/log-view/LogViewModel.ts` | **DELETE** |
| `src/renderer/editors/log-view/LogViewEditor.tsx` | **DELETE** (renamed/replaced by LogBody.tsx) |
| `src/renderer/editors/log-view/LogViewContext.ts` | Type swap `LogViewModel` → `LogViewEditor` |
| `src/renderer/editors/log-view/LogEntryWrapper.tsx` | Type swap |
| `src/renderer/editors/log-view/LogMessageView.tsx` | Type swap |
| `src/renderer/editors/log-view/LogEntryContent.tsx` | Type swap |
| `src/renderer/editors/log-view/StyledTextView.tsx` | Type swap |
| `src/renderer/editors/log-view/items/ButtonsDialogView.tsx` | Type swap |
| `src/renderer/editors/log-view/items/ConfirmDialogView.tsx` | Type swap |
| `src/renderer/editors/log-view/items/TextInputDialogView.tsx` | Type swap |
| `src/renderer/editors/log-view/items/CheckboxesDialogView.tsx` | Type swap |
| `src/renderer/editors/log-view/items/RadioboxesDialogView.tsx` | Type swap |
| `src/renderer/editors/log-view/items/SelectDialogView.tsx` | Type swap |
| `src/renderer/editors/log-view/items/GridOutputView.tsx` | Type swap |
| `src/renderer/editors/register-editors.ts` | Drop `log-view` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; add v4-native registration |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Add `log-view` branch to `wrapLegacyForPage` |
| `src/renderer/api/mcp-handler.ts` | Three `acquireViewModelSync` callsites → `instanceof LogViewEditor`; rename helper |
| `src/renderer/scripting/ScriptContext.ts` | `initializeUiFacade` swaps to instanceof + drops releaseList push |
| `src/renderer/scripting/api-wrapper/UiFacade.ts` | Constructor type swap; `this.vm` → `this.editor` |
| `src/renderer/scripting/api-wrapper/Progress.ts` | Constructor type swap |
| `src/renderer/scripting/api-wrapper/Grid.ts` | Constructor type swap |
| `src/renderer/scripting/api-wrapper/Text.ts` | Constructor type swap |
| `src/renderer/scripting/api-wrapper/Markdown.ts` | Constructor type swap |
| `src/renderer/scripting/api-wrapper/Mermaid.ts` | Constructor type swap |
| `src/renderer/scripting/api-wrapper/StyledTextBuilder.ts` | Constructor type swap (if needed) |
| `src/renderer/scripting/ScriptRunner.ts` | Drop pre-load line |
| `src/renderer/scripting/AutoloadRunner.ts` | Drop pre-load line |
| `src/renderer/editors/mcp-inspector/McpInspectorEditorModel.ts` | Drop pre-load line |

## Files NOT to touch

- `src/renderer/editors/log-view/logTypes.ts` — verbatim (entry types stay).
- `src/renderer/editors/log-view/logConstants.ts` — verbatim.
- `src/renderer/editors/base/IContentHost.ts` — `acquireViewModelSync` interface declaration stays (NoteItemEditModel still implements it; US-557 removes).
- `src/renderer/editors/text/TextEditorModel.ts` — `acquireViewModelSync` implementation stays (delegates to `_vmHost`; US-557 / US-559 remove). HS1 surface (`getEditorState` / `setEditorState`) already in place from US-552-B.
- `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` — own migration in US-557.
- `src/renderer/editors/base/ContentViewModelHost.ts` — alive for NoteItemEditModel; dies in US-557 / US-559.
- `src/renderer/editors/registry.ts` (legacy) — keep `loadViewModelFactory` machinery; serves other editors and `requireWellKnownPage`.
- `src/renderer/api/pages/PagesQueryModel.ts` — `getTextFileHost` already handles v4-native editors via `contentHost` (verified at line 94-99); no change.
- Well-known page registrations — `mcp-ui-log` and `mcp-server-log` still register with `editor: "log-view"`; the editor id continues to resolve.
- Shared UI primitives — `RenderFlexGrid`, `IconButton`, `Panel`, `Text`, `EditorError`, `ConfirmationDialog` — verbatim.

## Concerns / Open questions

### C1 — Should `LogToolbarBits` and `LogBody` live in `index.tsx` or in separate files?

`index.tsx` already hosts the module shell, the view wrapper, and the toolbar bits. Two ways to split:

(a) **Single file `index.tsx`** holds `logViewModule`, `LogViewEditorView`, `LogToolbarBits` (+ icons). `LogBody.tsx` is the only sibling.

(b) **Three files** — `index.tsx` (module + view), `LogToolbarBits.tsx`, `LogBody.tsx`.

**Resolution — (a).** Mirrors `src/renderer/editors/monaco/index.tsx` pattern: small files prefer co-location. `LogToolbarBits` is ~30 LOC including icon definitions — extracting to its own file is over-modularization. If a future contributor adds dozens of toolbar items they can split then.

### C2 — `itemsState` deliberately not persisted (size carve-out — resolved 2026-05-22)

User scenario: user runs a script that emits 200 `output.grid` entries; reorders columns on a few of them; restarts the app. Today's behavior (via `<host.id>-log-view-items.json` cache file): columns survive. New behavior: columns reset.

**Decision:** accept the regression. Rationale carried in Background's HS1 amendment + memory `feedback-hs1-size-considerations`:

1. `itemsState` scales linearly with log entry count; well-known log pages routinely carry 200+ entries.
2. The HS1 mirror's write to `host.editorSettings` would land in `openFiles0.json` — the per-window state file that's rewritten on a 500ms debounce on every editor mutation. Rapid `setItemState` calls (column-width ResizeObserver propagation, script-API mutation loops) would write-storm that file.
3. `openFiles0.json` is read eagerly at window boot to render the tab strip; bloating it slows startup.
4. Today's `<host.id>-log-view-items.json` cache file is the only existing persistence path for itemsState and it covers only one log page per file; the user has not reported missing this feature.

**Resulting behavior:**
- `itemsState` survives in-session mutations (reactive).
- `itemsState` does NOT survive switch-out (Monaco↔LogView swap clears it).
- `itemsState` does NOT survive restart.
- `showTimestamps` survives both (HS1 host slot, bounded).

If a future use case demands cross-restart preservation (e.g., a stable user-curated log review workflow), the right shape is a dedicated cache file (`<editor.id>-log-view-items.json` via `editor.stateStorage`) — NOT the host slot. Defer until requested.

### C3 — Well-known log page bootstrap order

`pagesModel.requireWellKnownPage("mcp-ui-log")` flow:

1. Construct legacy `TextFileModel` with `state.id = "mcp-ui-log"`, `state.editor = "log-view"`.
2. Call `editorModel.restore()` (legacy host restore — async — reads cache file `mcp-ui-log-host.txt` if it exists).
3. Call `wrap(editorModel)` → with US-553 branch, returns `LogViewEditor` with adopted host. `LogViewEditor.loadContent(content)` is called inline as part of the new branch.
4. `addPage(adapter, page)` attaches to page; page becomes active.

The `await editorRegistry.loadViewModelFactory(def.editor as EditorView)` at `PagesLifecycleModel.ts:299` survives — it pre-loads the legacy editor module (which `register-editors.ts:175` defines for log-view). Functionally a no-op after US-553 (the legacy module doesn't export an Editor anymore — the v4 module does), but harmless.

**Resolution:** No change needed. The cleanest tightening (drop the `loadViewModelFactory` line in `requireWellKnownPage` for `editor === "log-view"`) saves one async-wait microseconds-long; not worth the conditional. Leave for US-559.

### C4 — `LogViewEditor.loadContent` visibility

The base reparse (`loadContent`) is called from three sites: `restore()` (initial parse), `switchFrom()` (post-host-adopt parse), and `wrapLegacyForPage` (open-file inline parse). Should it be `public` or `private`?

(a) **`public`** — `wrapLegacyForPage` is an external caller and needs to invoke it. Matches Grid's `reparseRows`, which is also `public` for the same reason.

(b) **`private` + add a `bootstrap(content)` public method** that does the same thing.

**Resolution — (a).** Public, no wrapper. Symmetry with `GridEditor.reparseRows` at line 464 — same visibility, same purpose, same external caller (`wrapLegacyForPage`'s inline call from line 94).

### C5 — Pre-US-553 cache-file orphan cleanup

After upgrade, `<host.id>-log-view-items.json` cache files become orphaned. P9's no-sweep decision (epic-level) means they linger for well-known pages forever and get GC'd for user-created pages when those pages close.

**Resolution:** No action. Acceptable per P9. Worst case: a few KB of disk space lingers for the mcp-ui-log / mcp-server-log entries that exist before the upgrade. The cache directory's lifetime is bounded by the user's working set of opened files, which gets reset periodically.

### C6 — Switch widget rendering for `.log.jsonl` files

Today the switch widget on a `.log.jsonl` file shows: Text Editor, Log View. After US-553, both options come from the v4 registry: `monaco` (universal fallback, priority 50 in edit / 10 in view mode) and `log-view` (priority 20 from `acceptFile` for `.log.jsonl`, fallback to 60 from content-peek if language === "jsonl" with `"type":"log."` content).

The exact priority numbers map through the legacy delegate in the v4 registration (step 7 above): `legacy.acceptFile` returns 20, `legacy.switchOption` returns 10, fallback to 60 via the content-peek call. Whichever scores highest wins.

**Open question:** does the order in the switch widget matter (Log View should be visually before Text Editor when on a `.log.jsonl` file)? **Resolution:** check during acceptance testing. The v4 registry's `findEditorsAccepting` sorts by `p` descending (line 113), so highest-priority matches show first. `acceptFile === 20` outranks Monaco's 10-in-view / 50-in-edit only if the registry is queried with the right mode. Verify the switch widget UX matches today's. If not, bump LV's priority by 5–10 in the override.

### C7 — `restoreState` migration shim (no migration per C2 in walkthrough)

Today's `restoreItemsState` reads the cache file via `host.stateStorage.getState(host.id, "log-view-items")`. After US-553, this method is gone — `applyRestoreData` reads from descriptor, `adoptHost` reads from `host.editorSettings`. Anything that relies on the old cache-file path breaks silently (returns empty itemsState for that one boot).

**Resolution:** Accepted per the walkthrough's C2 (no migration shim; detect-and-skip). Document in the user-facing changelog: "Log View — per-entry view state (grid column ordering on `output.grid` entries, etc.) resets once after this upgrade; persists normally thereafter."

### C8 — Type rename ergonomics: `vm` → `editor`?

The child views consume the model as `props.vm: LogViewModel` (today's pattern). Mechanical type-only rename to `LogViewEditor` keeps the variable name `vm` everywhere. Some readers will prefer `props.editor: LogViewEditor` for semantic clarity.

**Resolution:** Keep variable name `vm`. Three reasons:
1. Smaller diff — only the type changes, every child view's body stays untouched.
2. Consistency with `UiFacade.ts` wrapper classes — they all use `this.vm` today; renaming to `this.editor` requires touching every wrapper file's body (Progress, Grid, Text, Markdown, Mermaid all do `this.vm.X` repeatedly).
3. The `vm` name still reads naturally — even though it's no longer literally a ViewModel, "log-view's controller" is colloquially a VM. Future cosmetic rename can be done as a single-commit search-and-replace later.

**Exception:** Inside `UiFacade.ts` (the constructor variable), rename `this.vm` → `this.editor`. UiFacade is the public scripting facade — clarity matters more than diff size there. Children and wrapper classes (Progress / Grid / Text / Markdown / Mermaid) keep `this.vm`.

### C9 — `LogQueueEvent.scrollToBottom` mailbox timing

Per LV5 + ComponentQueue's design (`mockups/ComponentQueue.ts`), an event sent before the view mounts buffers and fires once `queue.use` runs in the new view's render. The today's `forceScrollVersion` useEffect handles this via React's effect-on-state-change. New behavior:

1. Script calls `ui.dialog.confirm(...)` before view mounts (rare — most scripts run after the page exists).
2. `addDialogEntry` calls `typedQueue.send({ type: "scrollToBottom" })` synchronously.
3. View mounts; `model.queue.use(...)` registers a handler that drains buffered events.
4. Handler fires `scheduleScrollToBottom()`, scrolls the dialog into view.

**Resolution:** Verified by walkthrough LV5 / LV8. Same shape as Grid's `focusCell` event (which buffers across initEmptyPage's queue.send to handle the same race). No additional logic.

### C10 — Removing the `Editor` field from legacy `editorRegistry.register({id: "log-view", ...})`

After US-553, the legacy `loadModule` for log-view is reachable via:
- `PagesLifecycleModel.requireWellKnownPage` → `loadViewModelFactory(def.editor)` → calls the legacy `loadModule`, but only uses the `createViewModel` field to register the VM factory.

Today's `loadModule` (`register-editors.ts:175-188`) returns `{ Editor, createViewModel, newEditorModel, newEmptyEditorModel, newEditorModelFromState }`. After US-553:
- `createViewModel: createLogViewModel` — references a deleted symbol. Must drop.
- `Editor: module.LogViewEditor` — references a deleted symbol. Must drop.
- `newEditorModel*` — still valid (delegates to textEditorModule).

**Resolution:** Trim the legacy `log-view` entry's `loadModule` to:

```typescript
loadModule: async () => {
    // EPIC-028 / US-553 — LogView migrated to native v4 module. The legacy
    // Editor + createViewModel slots are unused; the newEditorModel* factories
    // are still consumed by the open-file flow to construct the underlying
    // TextFileModel host that v4 LogViewEditor wraps. Delegate to textEditorModule.
    return textEditorModule;
},
```

Mirrors the US-552 Grid pattern at `register-editors.ts:100-108` exactly.

## Acceptance criteria

Verify each scenario by manual testing or scripting. Capture observations in the implementation commit message if any deviate from expectations.

1. **MCP `ui_push` (no script running)** — start the app, trigger an `ui_push` from an external MCP client with one `log.info` entry. The MCP UI Log page opens; the entry renders with the expected formatting. (Validates `getOrCreateMcpLogViewEditor` post-rename + `addEntry`.)

2. **MCP dialog** — `ui_push` with `input.confirm`. Dialog renders; user clicks a button; MCP client receives the result with the chosen button name. (Validates `addDialogEntry` Promise resolution + the queue scrollToBottom event in LV5.)

3. **Script-driven UI log** — run a script that does `ui.log("hello"); ui.success("done"); ui.show.grid([{a:1,b:2}])`. The grouped log page opens with three entries; the grid entry renders with both columns. (Validates `executeUiOnPage` + wrapper classes — Progress / Grid / Text / Markdown / Mermaid.)

4. **Console forwarding** — script `console.log("from script")`. The log page shows a `log.log` entry with the captured text. (Validates `installConsoleForwarding` + `addConsoleEntry`.)

5. **Switch in / out (Log View ↔ Monaco)** — open a `.log.jsonl` file with entries; switch to Text Editor (Monaco) via the switch widget. Monaco shows the raw JSONL. Switch back to Log View — entries render again. (Validates `CONTENT_HOST_TRAIT.extractContentHost` + `switchFrom` + initial parse on re-entry; HS1 itemsState survives the swap.)

6. **showTimestamps persistence** — toggle timestamps on; restart the app. Open the same log page; timestamps still on. (Validates HS1 mirror writes `editorSettings["log-view"].showTimestamps`; host descriptor serializes; restore re-seeds.)

7. **itemsState transience confirmed** — script outputs `ui.show.grid([...])` with many columns; reorder the columns; restart the app. Re-open the log page; column order is **reset to default** (deliberate per C2 — size carve-out). The grid entry renders normally; no error.

8. **`forceScrollVersion` retirement** — verify in code that the field no longer exists on state and no view reads `state.forceScrollVersion`. (Code review — grep `forceScrollVersion` returns no hits in `src/renderer/`.)

9. **MCP request log** — open the MCP request log page (via `app.pages.requireWellKnownPage("mcp-server-log")` or the MCP Inspector). The page renders as Log View; `output.mcp-request` entries appear when MCP requests come in. (Validates `logIncomingRequest` + `showMcpRequestLog`.)

10. **Pre-US-553 session restore** — install US-553 on a system with an existing `mcp-ui-log` page containing entries. The page restores correctly; entries render; no error in the dev console. The orphan `<id>-log-view-items.json` file remains (acceptable per P9).

11. **`acquireViewModelSync("log-view")` callsite count** — `grep -r "acquireViewModelSync.\"log-view\"" src/` returns zero hits. The interface declaration (`IContentHost.ts:61`) and the TextEditorModel implementation (`TextEditorModel.ts:81`) stay alive for NoteItemEditModel consumption — they retire in US-557 / US-559.

12. **`loadViewModelFactory("log-view")` callsite count** — `grep -r "loadViewModelFactory(\"log-view\")" src/` returns zero hits.

13. **Dialog cancellation on dispose** — start a script that awaits `ui.dialog.confirm(...)`. Before clicking a button, close the log page (or switch the page to Monaco). The script's Promise resolves with the sentinel `{ type: "", id, timestamp: 0 }`; script continues without crashing.

14. **Type-check + lint pass** — `npm run lint` passes. No type errors after rename.

---

**Investigation complete 2026-05-22, ready for implementation.** Bundle the entire migration in a single commit — the file moves + type renames are all interlocking and partial commits would leave the build broken. Acceptance testing happens after the implementation commit; bugfix patches commit separately if any acceptance scenario fails.
