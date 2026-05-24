# Notebook + note-level switching walkthrough

> **Status:** Done 2026-05-20. Tier 5 per-editor walkthrough — Notebook editor (`.note.json` files) + note-level switching. **All ten concerns (NB1–NB10) RESOLVED.** Zero mockup adjustments — seventh template-confirmation walkthrough in a row (Grid + Preview group + Log View + Link + Todo + Rest Client + Notebook). **Resolves C4 (NoteItemEditModel decomposition) and C5 (per-note switch widget placement)** — the last two Cn concerns referencing walkthrough 29. **`ContentViewModelHost.ts` deletes entirely from the codebase** (last consumer dissolves with NB6). **First and only consumer of `switchEditorViaContentHost` at a second-level owner** (per-note level scoped to a single note's content) — demonstrates the EPIC-028 contract is fully composable.
>
> Walkthroughs 27 (Graph) and 28 (Draw) were **skipped** for the design phase by user decision — their structures match prior Tier 5 editors closely enough that re-litigating the standardized concerns (RC1-class uniform shape, RC3-class cache→descriptor, RC5-class self-write-guard, RC4-class three-site lifecycle, possibly RC7-class split-cache for Draw's embedded scene blobs) would add no design signal. Both will be investigated first-principles during implementation.
>
> **Notebook is structurally the most distinctive Tier 5 editor remaining** — it owns two `IContentHost` implementations in play simultaneously: `TextFileModel` (the `.note.json` file on disk, wrapped by NotebookEditor) and `NoteItemEditModel` (a per-note in-memory host one per note item, wrapped by an embedded EditorModel chosen per-note). This is the only place in EPIC-028 where `switchEditorViaContentHost` operates at a **second-level host** (the per-note level, scoped to a single note's content), and the only place where one editor (Notebook) contains many nested EditorModel instances (one per note). It is the **stress-test for the EditorModel + IContentHost contract at a second owner** and the place where C4 (NoteItemEditModel decomposition) and C5 (per-note switch widget placement) get codified.

---

## State today

`src/renderer/editors/notebook/` is a self-contained folder of 14 files:

| File group | Contents |
|------------|----------|
| Core | `NotebookViewModel.ts`, `NotebookEditor.tsx`, `notebookTypes.ts`, `index.ts` |
| Outer view machinery | `NoteItemView.tsx`, `NoteItemViewModel.ts`, `ExpandedNoteView.tsx`, `TagsListView.tsx`, `category-tree.tsx` |
| Per-note edit machinery | `note-editor/NoteItemEditModel.ts`, `note-editor/NoteItemActiveEditor.tsx`, `note-editor/NoteItemToolbar.tsx`, `note-editor/MiniTextEditor.tsx`, `note-editor/index.ts` |

### Today's `NotebookViewModel` state shape (12 fields)

```typescript
const defaultNotebookViewState = {
    data: { notes: [], state: {} } as NotebookData,
    error: undefined as string | undefined,
    leftPanelWidth: 200,
    expandedPanel: "categories" as ExpandedPanel,    // "tags" | "categories"
    categories: [] as string[],                       // derived from notes
    categoriesSize: {} as { [key: string]: number },  // derived counts
    tags: [] as string[],                             // derived from notes
    tagsSize: {} as { [key: string]: number },        // derived counts
    selectedCategory: "" as string,                   // "" = "All"
    selectedTag: "" as string,                        // "" = no tag filter
    searchText: "" as string,                         // search across category/tags/title/content
    filteredNotes: [] as NoteItem[],                  // derived view
    expandedNoteId: "" as string,                     // "" = no note expanded
};
```

### Today's `NotebookData` shape (root of `.note.json`)

```typescript
interface NotebookData {
    notes: NoteItem[];
    /** Per-note UI state, keyed by note id. */
    state: Record<string, NoteItemState>;
}

interface NoteItem {
    id: string;
    title: string;
    category: string;
    tags: string[];
    content: NoteContent;          // language + content + editor (preferred view per note)
    comment?: string;
    createdDate: string;
    updatedDate: string;
}

interface NoteItemState {
    contentHeight?: number;        // measured Monaco/Grid height for virtualized row sizing
    [key: string]: unknown;        // arbitrary editor-specific state (e.g., "grid-page")
}
```

Two load-bearing observations:

1. **`data.state[noteId]` carries arbitrary per-note editor-specific state in the JSON file** (via `NoteItemEditModel.stateStorage`). Today's `setNoteState(id, name, value)` writes `s.data.state[id][name] = value`. This means a note rendered as a Grid persists its column widths IN THE NOTEBOOK JSON FILE, not in a separate cache file. Logical per-note, not per-window — survives across windows because it's tied to the note, not the viewing window. Mirrors Todo's `data.state[id].contentHeight` (TD7) but goes further (arbitrary keys, not just heights).

2. **`note.content.editor` is the preferred editor view per note** (e.g., `"monaco"`, `"grid-json"`, `"markdown-view"`). Persists across restart inside the JSON. This is THE per-note "what view does this note render in" field that today's `changeEditor` mutates. Under C4 / NB7, the per-note three-phase switch propagates the new editor id back to this field.

### Today's `NotebookViewModel` private fields

| Field | Purpose |
|-------|---------|
| `lastSerializedData: NotebookData \| null` | Reference-equality marker — skips serialization when `state.data` hasn't been swapped (same shape as LV / LK / TD / RC) |
| `skipNextContentUpdate: boolean` | Self-write guard — set when the VM serializes its own state to JSON so `onContentChanged` doesn't re-parse what we just wrote (LV / LK / TD / RC pattern) |
| `lastFilterState` | Incremental-search optimization — caches `{ searchText, selectedCategory, selectedTag, expandedPanel }` so search-extension can filter the previous result without rescanning |

### Today's `NoteItemEditModel` — the second-level IContentHost

```typescript
class NoteItemEditModel implements IContentHost {
    readonly id: string;                                  // = note.id
    readonly type = "textFile" as const;
    private notebookModel: NotebookViewModel;
    private noteId: string;
    private _vmHost = new ContentViewModelHost();         // ref-counted content-view-model cache

    state: TComponentState<NoteItemEditState>;            // { content, language, editor }

    editor: NoteEditorModel;                              // Monaco-specific sub-model
    readonly stateStorage: EditorStateStorage;            // backed by notebook.data.state[id]

    // Portal refs for toolbar elements
    editorToolbarRefFirst: HTMLDivElement | null = null;
    editorToolbarRefLast: HTMLDivElement | null = null;
    editorFooterRefLast: HTMLDivElement | null = null;

    // Methods:
    changeContent(content, byUser?)
    changeEditor(editor)
    changeLanguage(language)
    runScript(all?)                                       // delegates to notebookPageModel
    syncFromNote(note)                                    // pulls content/language/editor from note
    acquireViewModel(editorId)                            // delegates to _vmHost
    acquireViewModelSync(editorId)                        // delegates to _vmHost — RETIRES per LV9
    prepareViewModel(editorId)                            // delegates to _vmHost — RETIRES per NB6
    releaseViewModel(editorId)                            // delegates to _vmHost — RETIRES per NB6
    persistContentHeight(height)                          // writes to notebookModel.setNoteHeight
    dispose()
}
```

Key observations:

- **NoteItemEditModel today IS a content host that holds content-view-models.** Each note has its own `_vmHost: ContentViewModelHost` that maintains a ref-counted cache of view models (e.g., `GridViewModel`, `MarkdownViewModel`) keyed by editorId. When the note's preferred editor changes from `"monaco"` to `"grid-json"`, the current view's `releaseViewModel("monaco")` is called and `acquireViewModel("grid-json")` returns a fresh Grid view model wrapping THIS NoteItemEditModel.
- **`changeEditor(editor)` propagates to `notebookModel.updateNoteEditor(noteId, editor)`** which mutates `note.content.editor` in the JSON data.
- **`stateStorage` is backed by `notebook.data.state[id]`** — not a cache file. State for nested editors (Grid column widths, search filter state) lives in the notebook JSON.
- **Portal refs** — today's NoteItemEditModel carries chrome portal refs (`editorToolbarRefFirst`, `editorToolbarRefLast`, `editorFooterRefLast`) so the nested editor can portal its toolbar buttons up into the per-note row. Same pattern as TextFileModel's chrome refs today. Under C8, these would dissolve into shared chrome components — but **the chrome surface for a nested note is different from a page chrome** (no save indicator, no encryption padlock, no script panel, no language picker by default), so this needs care.

### Today's NoteItemViewModel — the React-side note adapter

```typescript
class NoteItemViewModel extends TComponentModel<NoteItemViewState, NoteItemViewProps> {
    noteItemRef: HTMLDivElement | null = null;
    searchText: string | undefined = undefined;
    private _editModel: NoteItemEditModel | null = null;

    get editModel(): NoteItemEditModel {
        if (!this._editModel) {
            this._editModel = new NoteItemEditModel(this.props.notebookModel, this.props.note);
        }
        return this._editModel;
    }

    init() {
        this.setupWheelHandler();
        this.effect(() => this.syncEditModel(), () => [
            this.props.note.content.content,
            this.props.note.content.language,
            this.props.note.content.editor,
        ]);
        // ... category sync effect
    }

    dispose() {
        this._editModel?.dispose();
        this.teardownWheelHandler();
    }
}
```

- **Lifetime tied to React mount.** When a note scrolls into view (RenderFlexGrid mounts the cell), the NoteItemView mounts → lazy-creates NoteItemEditModel on first access → renders the nested editor. When the note scrolls out of view far enough to unmount, NoteItemViewModel.dispose() fires → NoteItemEditModel.dispose() fires → embedded view models release.
- **`syncEditModel` effect** keeps the edit model in sync with external mutations to `note.content.*` (e.g., a user typing in a separate window editing the same notebook file).
- **Wheel handler** intercepts wheel events on the note item to scroll the OUTER notebook list when focus is not inside the note — prevents the nested Monaco/Grid from "trapping" wheel scroll.

### Today's notebook-view registration in `register-editors.ts:271-307`

```typescript
editorRegistry.register({
    id: "notebook-view",
    name: "Notebook",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => matchesPattern(fileName, /\.note\.json$/i) ? 20 : -1,
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) =>
        languageId === "json" && fileName && matchesPattern(fileName, /\.note\.json$/i) ? 10 : -1,
    isEditorContent: (languageId, content) =>
        languageId === "json"
        && content.includes('"type"')
        && /"type"\s*:\s*"note-editor"/.test(content)
        && content.includes('"notes"'),
    loadModule: async () => {
        const [module, { createNotebookViewModel }] = await Promise.all([
            import("./notebook/NotebookEditor"),
            import("./notebook/NotebookViewModel"),
        ]);
        return {
            Editor: module.NotebookEditor,
            createViewModel: createNotebookViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

Same quartet (`acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent`) as every other Tier 5 editor — collapses into single `accepts()` per NB10.

### Today's NO scripting facade

No `NotebookEditorFacade.ts` and no `page.asNotebook()` accessor. Scripts that want to manipulate a notebook today go through `page.content` (the raw `.note.json` string). NoteItemEditModel.runScript delegates to the **notebook page model**, not to the note — so a script run from inside a note shares the same `page` context as the notebook itself. **Matches Rest Client's pattern** (RC10) — second instance of "text-bearing Tier 5 editor without a dedicated scripting facade."

### Today's drag-and-drop traits — three active systems

`NotebookEditor.tsx` and `NotebookViewModel.ts` operate three drag trait systems simultaneously:

1. **`TraitTypeId.Note`** (emit) — each NoteItemView emits a Note drag payload for cross-category drag (drop a note onto a category in the tree → assigns category).
2. **`TraitTypeId.NotebookCategory`** (emit + accept) — categories in the left tree can be dragged onto other categories to nest them (`moveCategory` flow with `ui.confirm`).
3. **`LINK` trait** (accept) — categories accept LINK drops from PageNavigator (creates a new note from the link).

This is the **richest trait consumer in the Tier 5 set** — three active trait types vs. Link/Rest Client's two. Verbatim port to EditorModel; drag traits stay orthogonal to EditorModel traits.

---

## State after refactor

```typescript
class NotebookEditor extends EditorModel<NotebookEditorState, void, NotebookQueueEvent> {
    readonly editorId = "notebook-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;

    private skipNextContentUpdate = false;
    private lastSerializedData: NotebookData | null = null;
    private lastFilterState = { searchText: "", selectedCategory: "", selectedTag: "", expandedPanel: "" };

    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    constructor(args?: EditorConstructorArgs) {
        super(args);
        // CONTENT_HOST_TRAIT closure — same shape as Tier 5 template
        this.declareTrait(CONTENT_HOST_TRAIT, {
            getHost: () => this._host,
            getDescriptor: () => this._host?.getDescriptor() ?? null,
        });
    }

    // accessors
    get host(): TextFileModel { return this._host!; }

    // lifecycle (three-site split — NB4)
    async restore(args: RestoreArgs): Promise<void> {
        // 1. Construct or restore host
        if (!this._host) {
            this._host = args.hostDescriptor
                ? await TextFileModel.fromDescriptor(args.hostDescriptor)
                : new TextFileModel();
        }
        this._host.setStorage(this.stateStorage);
        if (!this._host.restored) await this._host.restore();

        // 2. Restore editor state from descriptor (or default)
        const restored = args.editorState as Partial<NotebookEditorState> | undefined;
        if (restored) {
            this.state.update((s) => {
                if (restored.leftPanelWidth !== undefined) s.leftPanelWidth = restored.leftPanelWidth;
                if (restored.expandedPanel !== undefined) s.expandedPanel = restored.expandedPanel;
                if (restored.selectedCategory !== undefined) s.selectedCategory = restored.selectedCategory;
                if (restored.selectedTag !== undefined) s.selectedTag = restored.selectedTag;
            });
        }

        // 3. Initial parse of host content
        this.loadData(this._host.state.get().content || "");

        // 4. Subscribe to own state changes (debounced serialize)
        this.addSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));

        // 5. adoptHost subscriptions (defer to adoptHost)
        this.adoptHost();
    }

    private adoptHost(): void {
        // Subscribe to host content changes — drives re-parse when external edits happen
        this._hostContentUnsub = this._host!.state.subscribe(() => {
            this.onContentChanged(this._host!.state.get().content);
        });
    }

    private onContentChanged(content: string): void {
        if (this.skipNextContentUpdate) {
            this.skipNextContentUpdate = false;
            return;
        }
        this.loadData(content);
    }

    async dispose(): Promise<void> {
        // Flush pending debounced save
        this.onDataChanged();
        this._hostContentUnsub?.();
        this._hostContentUnsub = null;
        this._hostStateUnsub?.();
        this._hostStateUnsub = null;
        await this._host?.dispose();
    }

    // persistence — only descriptor-side state persists
    getRestoreData(): Partial<NotebookEditorState> {
        const { leftPanelWidth, expandedPanel, selectedCategory, selectedTag } = this.state.get();
        // data / error / categories / categoriesSize / tags / tagsSize / filteredNotes / expandedNoteId
        // all stripped — derived from host content or transient.
        return { leftPanelWidth, expandedPanel, selectedCategory, selectedTag };
    }

    // serialization (same shape as LV / LK / TD / RC)
    private onDataChanged = () => {
        const { data, error } = this.state.get();
        if (error) return;
        if (data !== this.lastSerializedData) {
            this.lastSerializedData = data;
            this.skipNextContentUpdate = true;
            const content = JSON.stringify({ type: "note-editor", ...data }, null, 4);
            this._host!.changeContent(content, true);
        }
    };

    // loadData / loadCategories / loadTags / applyFilters / mutators — preserved verbatim
    // ... all today's mutator methods (addNote, deleteNote, expandNote, updateNoteContent, …)
    //     port verbatim — the only difference is they live on the EditorModel
    //     instead of on a ContentViewModel.

    // optional hooks
    findCompatibleEditors(): EditorView[] {
        return editorRegistry.findEditorsAccepting(this._host!).map(e => e.id);
    }

    accepts(args: AcceptsArgs): number { /* see NB10 */ }

    focus(): void {
        // Delegate to view — view drains focus queue event.
        this.queue.send({ type: "focus" });
    }
}
```

### State slice shape

```typescript
export interface NotebookEditorState extends EditorStateBase {
    // PERSISTED via getRestoreData → descriptor.state:
    leftPanelWidth: number;             // splitter position
    expandedPanel: ExpandedPanel;       // "tags" | "categories"
    selectedCategory: string;           // "" = "All"
    selectedTag: string;                // "" = no tag

    // RIDE-STATE (in editor.state for reactivity but STRIPPED from getRestoreData):
    data: NotebookData;                 // re-parsed from host content
    error: string | undefined;          // re-derived from parse
    categories: string[];               // recomputed by loadCategories
    categoriesSize: { [k: string]: number }; // recomputed
    tags: string[];                     // recomputed by loadTags
    tagsSize: { [k: string]: number };  // recomputed
    filteredNotes: NoteItem[];          // recomputed by applyFilters
    expandedNoteId: string;             // session-only overlay; "" on restore

    // TRANSIENT (session-only):
    searchText: string;                 // intentionally NOT persisted (transient gesture; same shape as TD2)
}
```

13 fields in total — 4 persisted, 8 ride-state, 1 transient.

### Queue event union

```typescript
export type NotebookQueueEvent = { type: "focus" };
export type NotebookQueueRequest = never;
```

Same minimal queue as Grid / Todo / Rest Client — single focus event from `<TextChrome>`'s root-focus subscription. No request lifecycle (all UiFacade reads are sync against `editor.state`).

### NoteItemEditModel (after C4 / NB6 restructure)

```typescript
class NoteItemEditModel implements IContentHost {
    readonly id: string;                                  // = note.id
    private notebookEditor: NotebookEditor;
    private noteId: string;

    state: TComponentState<NoteItemContentHostState>;     // { content, language? }
    readonly stateStorage: EditorStateStorage;            // backed by notebook.data.state[id]

    constructor(notebookEditor: NotebookEditor, note: NoteItem) {
        this.notebookEditor = notebookEditor;
        this.noteId = note.id;
        this.id = note.id;
        this.state = new TComponentState<NoteItemContentHostState>({
            content: note.content.content,
            language: note.content.language,
        });
        this.stateStorage = {
            getState: async (id, name) => notebookEditor.getNoteState(id, name),
            setState: async (id, name, state) => { notebookEditor.setNoteState(id, name, state); },
        };
    }

    // IContentHost interface
    changeContent(content: string, byUser?: boolean): void {
        this.state.update((s) => { s.content = content; });
        this.notebookEditor.updateNoteContent(this.noteId, content);
    }

    changeLanguage(language: string | undefined): void {
        this.state.update((s) => { s.language = language; });
        this.notebookEditor.updateNoteLanguage(this.noteId, language ?? "");
    }

    setStorage(_storage: EditorStateStorage): void {
        // No-op — NoteItemEditModel's storage is already backed by notebook.data.state[id]
        // (NOT by the wrapping editor's cache file). The per-note state pathway is
        // load-bearing: per-note Grid column widths survive across windows because
        // they live in the notebook JSON, not in a per-window cache file.
    }

    async dispose(): Promise<void> {
        // No I/O to flush — content propagation to notebookEditor is sync.
        // The embedded EditorModel that wraps this host disposes separately
        // when the React cell unmounts.
    }

    getDescriptor(): HostDescriptor {
        // NoteItemEditModel is transient (React-mount lifetime). Not standalone-persistable.
        // Returning a minimal descriptor here is for completeness — the embedded EditorModel
        // is never persisted independently of the notebook editor itself (the notebook's
        // descriptor captures all notes in one shot).
        return { kind: "noteItem", state: { noteId: this.noteId } };
    }

    syncFromNote(note: NoteItem): void {
        const cur = this.state.get();
        if (cur.content !== note.content.content || cur.language !== note.content.language) {
            this.state.update((s) => {
                s.content = note.content.content;
                s.language = note.content.language;
            });
        }
    }

    // runScript — preserves today's "scripts run against the notebook's page, output groups with notebook"
    runScript = async (all?: boolean) => {
        const { language, content } = this.state.get();
        const script = all
            ? content
            : this.embeddedEditor?.getSelectedText() || content;   // see NB7 for embeddedEditor reference
        if (isScriptLanguage(language)) {
            const pageModel = this.notebookEditor.pageModel;       // forward to notebook's page
            await scriptRunner.runWithResult(pageModel.id, script, pageModel, language);
        }
    };
}
```

**What deletes vs. today:**

- `_vmHost: ContentViewModelHost` field — DELETES.
- `acquireViewModel` / `releaseViewModel` / `prepareViewModel` / `acquireViewModelSync` methods — ALL DELETE. (LV9 already retired `acquireViewModelSync` at the IContentHost interface and at TextFileModel; NB6 finishes the cleanup on NoteItemEditModel.)
- `editor: NoteEditorModel` field — DELETES. The Monaco-specific sub-model relocates into the embedded MonacoEditor.
- `editorToolbarRefFirst` / `editorToolbarRefLast` / `editorFooterRefLast` portal refs — DELETE per C8 (chrome dissolves into shared components; note-row chrome is a minimal variant that doesn't need portal refs).
- `type = "textFile"` discriminator — DELETES. The host's identity comes from its class (NoteItemEditModel), not a string discriminator.
- `compatibility properties` (`noLanguage`, `getIcon`, `filePath`, `title`, `encrypted`, `decrypted`) — most DELETE. Anything still needed reads via `instanceof` checks (C1 pattern).

### UI shape (NotebookEditorView + NotebookBody)

```tsx
function NotebookEditorView({ editor }: { editor: NotebookEditor }) {
    return (
        <TextChrome editor={editor}>
            <NotebookBody editor={editor} />
        </TextChrome>
    );
}

function NotebookBody({ editor }: { editor: NotebookEditor }) {
    const pageState = useSyncExternalStore(
        (cb) => editor.state.subscribe(cb),
        () => editor.state.get(),
    );

    // ... category tree, splitter, RenderFlexGrid — all preserved verbatim
    //     from today's NotebookEditor.tsx, with the only difference being
    //     `vm` → `editor` references.

    // Per-note rendering composes a NEW per-note EditorModel instance (NB7):
    const renderNoteCell = (p: RenderFlexCellParams) => {
        const note = notes[p.row];
        if (!note) return null;
        return (
            <NoteItemView
                key={note.id}
                note={note}
                notebookEditor={editor}
                cellRef={p.ref}
            />
        );
    };

    // ... (rest of body)
}
```

### NoteItemView (after C4 / C5 restructure)

```tsx
function NoteItemView({ note, notebookEditor, cellRef }: NoteItemViewProps) {
    const vm = useComponentModel(NoteItemViewModel, { note, notebookEditor });
    const editModel = vm.editModel;                            // lazy NoteItemEditModel
    const embeddedEditor = vm.embeddedEditor;                  // current per-note EditorModel
    const compatibleEditors = embeddedEditor.findCompatibleEditors();

    return (
        <div ref={vm.setRefs} onWheel={...}>
            <NoteHeader note={note} ... />
            {/* Per-note switch widget — C5 */}
            <EditorSwitchWidget
                current={embeddedEditor.editorId}
                options={compatibleEditors}
                onSwitch={vm.switchNoteEditor}
            />
            {/* Per-note embedded editor view */}
            <embeddedEditor.View editor={embeddedEditor} />
        </div>
    );
}
```

`embeddedEditor` is a per-note `EditorModel` instance (Monaco / Grid / Markdown / Mermaid / SVG / Html) wrapping the NoteItemEditModel via the standard `IContentHost` contract. **First EPIC-028 use of `EditorModel` at a non-page-level scope.**

### NoteItemViewModel (after C4 / C5 restructure)

```typescript
class NoteItemViewModel extends TComponentModel<NoteItemViewState, NoteItemViewProps> {
    private _editModel: NoteItemEditModel | null = null;
    private _embeddedEditor: EditorModel | null = null;

    get editModel(): NoteItemEditModel {
        if (!this._editModel) {
            this._editModel = new NoteItemEditModel(this.props.notebookEditor, this.props.note);
        }
        return this._editModel;
    }

    get embeddedEditor(): EditorModel {
        if (!this._embeddedEditor) {
            this._embeddedEditor = this.createEmbeddedEditor(this.props.note.content.editor || "monaco");
        }
        return this._embeddedEditor;
    }

    private createEmbeddedEditor(editorId: EditorView): EditorModel {
        // Standard factory path — same as PageModel.setMainEditor uses for top-level editors.
        const factory = editorRegistry.getEditorModelFactory(editorId)!;
        const editor = factory({
            initialHost: this.editModel,    // injects NoteItemEditModel as the host
        });
        editor.restore({ hostDescriptor: undefined, editorState: undefined });
        return editor;
    }

    // C5 per-note switch — three-phase under the hood
    switchNoteEditor = async (newEditorId: EditorView) => {
        const oldEditor = this.embeddedEditor;
        if (oldEditor.editorId === newEditorId) return;

        const factory = editorRegistry.getEditorModelFactory(newEditorId)!;
        const newEditor = factory({});
        await newEditor.switchFrom(oldEditor);      // standard three-phase
        await newEditor.restore({});

        this._embeddedEditor = newEditor;
        await oldEditor.dispose();

        // Propagate the new editor type back to the note's persisted data
        this.props.notebookEditor.updateNoteEditor(this.props.note.id, newEditorId);

        this.forceUpdate();                          // trigger re-render with new embedded editor
    };

    dispose() {
        this._embeddedEditor?.dispose();
        this._editModel?.dispose();
    }
}
```

### Initial host injection — `EditorConstructorArgs.initialHost`

To support C4's "Initial host injection uses a new public method (likely `setContentHost(host)`) on text-bearing editors", **NB6 proposes injecting the host directly via the editor's constructor argument** rather than a separate `setContentHost()` call:

```typescript
interface EditorConstructorArgs {
    initialHost?: IContentHost;        // OPTIONAL — supplied when wrapping an existing host
                                       // (notebook's per-note case; restore path)
    // ... other args ...
}

abstract class EditorModel<...> {
    protected _host: IContentHost | null = null;

    constructor(args?: EditorConstructorArgs) {
        if (args?.initialHost) {
            this._host = args.initialHost;
        }
    }
}
```

Top-level page-owned editors construct without `initialHost` and create their TextFileModel inside `restore()` (standard path). Per-note embedded editors construct WITH `initialHost: noteItemEditModel` and skip the "construct host" branch of `restore()`. **The new method shape codifies as `EditorConstructorArgs.initialHost: IContentHost | undefined`** (cleaner than a separate `setContentHost()` call — keeps host adoption at the only place the host can be adopted: construction).

### accepts() predicate

```typescript
accepts({ host, fileName, language }: AcceptsArgs): number {
    // Filename match — strong signal (.note.json)
    if (fileName && /\.note\.json$/i.test(fileName)) return 70;

    // Content-peek fallback for JSON files containing notebook structure
    if (language === "json" && host) {
        const content = host.state.get().content;
        if (
            content.includes('"type"')
            && /"type"\s*:\s*"note-editor"/.test(content)
            && content.includes('"notes"')
        ) return 60;
    }

    return -1;
}
```

Mirrors LV10/GR10/LK10/TD10/RC10 calibration across all nine Tier 5 editors.

### Switch in / out (top-level)

- **Switch in** (Monaco → NotebookEditor over the same `.note.json` host): standard three-phase. `NotebookEditor` constructor adopts the existing TextFileModel host; `restore()` parses the JSON content; sidebar contributions = none; chrome = `<TextChrome>`.
- **Switch out** (NotebookEditor → Monaco): standard three-phase; Monaco renders raw JSON; useful for debugging or hand-editing the `.note.json` file.

Switching at the top level does NOT affect per-note nested editors — those are children of NotebookEditor, not of the page.

### Switch in / out (per-note — C5)

This is the **load-bearing novel pattern** of walkthrough 29. Per-note switch operates inside the NoteItemView component's lifetime:

1. User clicks `EditorSwitchWidget` option (e.g., "Switch to Grid").
2. `vm.switchNoteEditor("grid-json")` runs.
3. Old per-note editor (Monaco) → new per-note editor (Grid) via standard three-phase `switchFrom` → `restore`.
4. The NoteItemEditModel host is transferred from the old EditorModel to the new EditorModel via the standard `IContentHost` adoption mechanism.
5. `notebookEditor.updateNoteEditor(noteId, "grid-json")` writes the new editor id to `note.content.editor`.
6. `notebookEditor`'s `onDataChangedDebounced` fires → serializes the JSON → writes to `_host` → cycle completes.
7. NoteItemView re-renders with `embeddedEditor.View` resolving to the Grid view component.

The mechanism is **the same three-phase switch used at the page level**, just scoped to a different owner (the NoteItemViewModel). This is what "switchEditorViaContentHost at a second owner" means in the walkthrough 29 scope.

---

## Lifecycle hooks table

| Hook | Override? | What it does |
|------|-----------|--------------|
| constructor(args) | ✅ | Declares CONTENT_HOST_TRAIT closure; adopts `args.initialHost` if present. |
| `restore(args)` | ✅ | Constructs/restores host; applies restored editor state; initial parse of host content; subscribes own state changes; calls `adoptHost`. |
| `adoptHost()` | ✅ | Subscribes to host content changes — drives re-parse via `onContentChanged`. |
| `dispose()` | ✅ | Flushes pending debounced save; unsubscribes; disposes host. |
| `getRestoreData()` | ✅ | Returns `{ leftPanelWidth, expandedPanel, selectedCategory, selectedTag }`. |
| `findCompatibleEditors()` | ✅ | Returns `editorRegistry.findEditorsAccepting(host).map(e => e.id)`. |
| `accepts(args)` | ✅ | Filename `.note.json` priority 70 + content-peek priority 60. |
| `focus()` | ✅ | Sends `{ type: "focus" }` to view queue. |
| `getNavigatorTarget()` | ❌ | Inherits default. |
| `beforeNavigateAway()` | ❌ | Notebook is non-sidebar-owning; LK7 hook does not apply. |
| `onMainEditorChanged()` | ❌ | Notebook is non-sidebar-owning; LK8 hook does not apply. |
| `setSidebarPanels()` | ❌ | Notebook does not contribute sidebar panels. |

**9 overrides** — same count as Grid / Todo / Rest Client (vs. Link's 11). Confirms the 9/9 hook stability across all non-sidebar-owning Tier 5 editors.

---

## Persistence

`EditorDescriptor` for a Notebook page:

```typescript
{
    kind: "editor",
    editorId: "notebook-view",
    id: "<editor.id transferred from any prior editor at this page>",
    state: {
        leftPanelWidth: 220,
        expandedPanel: "categories",
        selectedCategory: "project/EPIC-028",
        selectedTag: "",
    },
    host: {
        kind: "textFile",
        state: { filePath: "C:/.../notes.note.json", modified: false, ... },
        pipe: { kind: "FileProvider", path: "C:/.../notes.note.json" },
    },
}
```

`data.notes` content lives in the host's cache file `<editor.id>-host.txt` (the JSON-serialized `.note.json` content). `data.state[noteId]` per-note state survives because it's INSIDE that JSON.

`expandedNoteId` is intentionally NOT persisted (overlay state; user expects to start with no expansion on restart). `searchText` is intentionally NOT persisted (transient gesture; same shape as TD2 / RC2).

Per-note embedded editor state (Grid column widths, etc.) does NOT persist via descriptor — it persists via `NoteItemEditModel.stateStorage` which writes into `notebook.data.state[noteId][name]` (i.e., **inside the JSON file**). This is by design (per-note state lives with the note across windows / restart / cross-window page transfer). Same pattern as TD7 but generalized to arbitrary keys.

---

## Scripting

**NO scripting facade.** Matches Rest Client's RC10 deferral — second instance.

Scripts that want to manipulate a notebook today operate against `page.content` (the raw `.note.json` string). Adding `page.asNotebook()` would expose typed access to `data.notes`, `addNote(...)`, etc., but:

- No existing consumer needs it.
- The mechanical 4-file touch (facade + `api/types/notebook-editor.d.ts` + `PageWrapper.asNotebook` + EditorWrapper plumbing) is deferred until a real consumer lands.
- Rest Client + Notebook both deferring facades documents the architectural property: **scripting facades are opt-in per editor, not required by the Tier 5 template.**

NoteItemEditModel.runScript (for scripts run from inside a note) is preserved verbatim. Scripts run against the NOTEBOOK page model (parent), not against the note. Output groups with notebook. This is intentional — a script in a note is "a script in this notebook," not "a script in this isolated note."

---

## Concerns

### NB1 — NotebookEditor topology

**RESOLVED 2026-05-20** — Option (a) confirmed. NotebookEditor IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT — **ninth Tier 5 editor** in the uniform shape (Monaco / Grid / Markdown / Mermaid / LogView / Link / Todo / RestClient / Notebook).

Same `~80 LOC` skeleton (CONTENT_HOST_TRAIT closure + adoptHost + switchFrom + restore + dispose) carries Notebook end-to-end. Notebook is non-sidebar-owning (left tree composed inline inside the editor body via `<Splitter>`, not a sidebar editor); 9 hook overrides matches Grid / Todo / RestClient.

Rejected (b) hybrid sub-class extending some `NotebookEditorBase` — no benefit since the Tier 5 template already carries all uniform machinery; (c) special-case Notebook as a non-Tier-5 editor — would force separate switch + restore + persistence pathways for no observable benefit.

### NB2 — State slice composition

**RESOLVED 2026-05-20** — Option (a) confirmed. 4 persisted (`leftPanelWidth` + `expandedPanel` + `selectedCategory` + `selectedTag`) / 8 ride-state stripped (`data` / `error` / `categories` / `categoriesSize` / `tags` / `tagsSize` / `filteredNotes` / `expandedNoteId`) / 1 transient (`searchText`).

`leftPanelWidth` silent today-bug incidentally fixed — **fourth instance** of this incidental fix (LK2 → TD2 → RC2 → NB2). Today's NotebookViewModel persists state via TWO mechanisms:

- `data.state[noteId]` lives in the JSON file (per-note state — survives correctly).
- Everything else (`leftPanelWidth`, `expandedPanel`, `selectedCategory`, `selectedTag`) has **NO persistence today** — gets recreated to defaults on every notebook open. Folding into `EditorDescriptor.state` fixes this for free.

`expandedNoteId` rides state for reactivity but strips from getRestoreData — user expects no overlay on restart. `searchText` transient (same shape as TD2 / RC2 — search is a session gesture).

### NB3 — Per-editor cache file → descriptor.state consolidation

**RESOLVED 2026-05-20** — Option (a) confirmed. Fold UI-side selection state into `EditorDescriptor.state` — **sixth instance** of "per-editor cache file → descriptor.state" consolidation pattern (Grid GR4 → Log View LV3 → Link LK3 → Todo TD3 → Rest Client RC3 → Notebook NB3).

But Notebook today has NO dedicated UI cache file at the editor level — its selection state simply doesn't persist. So unlike Grid / Log View / Link / Todo / Rest Client where a today's cache file *retires*, Notebook is a case of **NEW persistence ADDED via descriptor** (selection state newly survives restart — silent today-bug incidentally fixed).

Pattern now standardized across **six of nine** Tier 5 editors. Today's two implementation variants (LK / TD / RC: a cache file → descriptor; NB: no persistence → descriptor) both land at the same destination.

Rejected (b) keep no-persistence — would be silent today-bug carried forward into EPIC-028; user-visible regression on every restart.

**Amended 2026-05-21 by HS1.** Folds into `host.editorSettings["note-view"]` (final Notebook editor id pending — `note-view` per registry; finalize in implementation), not `EditorDescriptor.state`. `leftPanelWidth` + `expandedPanel` + `selectedCategory/Tag` ride the host slot — survive Notebook↔Monaco switches AND app restarts. NoteItemEditModel (NB6) gains its own IContentHost implementation per NB8 (`notebook.data.state[noteId].editorSettings` backing) for per-note embedded-editor view state — same template, different storage backing (notebook JSON, not host descriptor). Implementation of the cross-cutting contract pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### NB4 — Three-site lifecycle split

**RESOLVED 2026-05-20** — Option (a) confirmed. Today's `onInit` (5 statements: state subscribe + initial loadData) splits cleanly into `restore()` (initial parse + state subscribe) + `adoptHost()` (host content subscription) + `dispose()` (flush + unsubscribe + host dispose).

**Fifth Tier 5 editor** in this lifecycle shape (LV4 → LK4 → TD4 → RC4 → NB4).

### NB5 — Self-write-guard pattern

**RESOLVED 2026-05-20** — Option (a) confirmed. Keep `skipNextContentUpdate` editor-private flag — **fifth instance** of self-write-guard pattern (LV6 → LK5 → TD5 → RC5 → NB5).

Pattern fully solidified. With five instances, host-side `bySelf` parameter (option b) and TOneState change-reason tracking (option c) are both **architecturally retired** as future-rejected paths.

### NB6 — NoteItemEditModel decomposition (resolves C4)

> **AMENDED 2026-05-24 — outer-only US-557 defers NB6 to US-579.** US-557's investigation pass surfaced that inner per-note migration requires (1) widening `adoptHost(host: TextFileModel)` → `adoptHost(host: IContentHost)` across 12 Tier-5 modules, (2) auditing each editor for TextFileModel-only method calls (`host.script`, `host.io.saveState`, `host.confirmRelease`, `host.setEditorOverlayRef`, `host.pipe`, etc.) and either no-op'ing them in the per-note path or implementing equivalents, and (3) adding an `EditorModule.Body` slot so embedded editors render without TextChrome. Under US-557 outer-only scope, NoteItemEditModel keeps its `_vmHost: ContentViewModelHost` field and `acquireViewModel*` methods verbatim; `ContentViewModelHost.ts` stays alive; `NoteEditorModel` Monaco-specific sub-class stays alive. The decomposition lands in [US-579 — Notebook inner per-note migration](../../../tasks/US-579-notebook-inner-per-note-migration/README.md), positioned in EPIC-028 Phase D before US-559.
>
> Original NB6 resolution kept for reference below:

**RESOLVED 2026-05-20** — Option (a) confirmed. NoteItemEditModel becomes a **lightweight transient IContentHost** (lifetime tied to React mount via NoteItemViewModel.dispose). The content-view-model machinery (`_vmHost: ContentViewModelHost` field + `acquireViewModel` / `releaseViewModel` / `prepareViewModel` methods) **completely retires** — these were the last consumers of the old subsystem.

Specifically:
- `_vmHost` field — DELETES (no more content-view-model cache).
- `acquireViewModel` / `releaseViewModel` / `prepareViewModel` / `acquireViewModelSync` — ALL DELETE. (LV9 already retired `acquireViewModelSync` at IContentHost interface and TextFileModel; NB6 finishes the cleanup on NoteItemEditModel — completes LV9's "(also touched by walkthrough 29)" deferred work.)
- `editor: NoteEditorModel` field — DELETES. The Monaco-specific selection/height/highlight machinery relocates into the embedded MonacoEditor.
- Portal refs (`editorToolbarRefFirst/Last`, `editorFooterRefLast`) — DELETE per C8.
- `type = "textFile"` discriminator — DELETES.
- Compatibility properties (`noLanguage`, `getIcon`, `filePath`, `title`, `encrypted`, `decrypted`) — DELETE (use `instanceof` checks per C1).
- New methods per the EPIC-028 IContentHost interface:
  - `setStorage(storage)` — no-op (stateStorage is already backed by `notebook.data.state[id]`).
  - `dispose()` — no I/O to flush; embedded EditorModel handles its own dispose separately.
  - `getDescriptor()` — returns minimal `{ kind: "noteItem", state: { noteId } }` for interface completeness; never independently persisted.

After NB6, NoteItemEditModel is **~70 LOC** (down from today's ~375 LOC) — strictly a thin adapter over the notebook's per-note data, exposing IContentHost methods that forward to the parent NotebookEditor.

**`src/renderer/editors/base/ContentViewModelHost.ts` deletes entirely from the codebase** after NB6. Its last two consumers (TextFileModel via walkthroughs 20–25, NoteItemEditModel via NB6) both dissolve. Net the codebase loses ~80 LOC of ref-counting infrastructure that no longer has any consumers.

Rejected (b) keep `_vmHost` ref-counting — nothing references it post-EPIC-028; embedded editors are standalone EditorModels, not ref-counted view-models; (c) split NoteItemEditModel into separate host + adapter classes — adds complexity for no observable benefit; the adapter IS the host, one class is the simplest representation.

### NB7 — Per-note embedded EditorModel + per-note switch widget (resolves C5)

> **AMENDED 2026-05-24 — outer-only US-557 defers NB7 to US-579.** US-557 outer-only keeps today's per-note dispatch (`NoteItemActiveEditor` → `AsyncEditor` → legacy `XxxView` via legacy `editorRegistry`) verbatim. The `EditorConstructorArgs.initialHost` primitive proposed below does NOT land under US-557 — US-579's investigation pass will revisit whether to use `EditorConstructorArgs.initialHost` (walkthrough proposal) or to extend the existing `adoptHost(host)` pattern that `wrapLegacyForPage` already establishes (US-557 NB-IMPL2 recommendation). The per-note three-phase switch + the new `EditorModule.Body` slot land under US-579.
>
> Original NB7 resolution kept for reference below:

**RESOLVED 2026-05-20** — Option (a) confirmed. Each NoteItemView holds a `embeddedEditor: EditorModel` instance (Monaco / Grid / Markdown / Mermaid / SVG / Html / etc.) wrapping the per-note NoteItemEditModel. Per-note switch widget (NoteItemView-local) reads `embeddedEditor.findCompatibleEditors()` for the option list and on user click triggers per-note three-phase switch (`createEditor → switchFrom → restore` then replace the embedded editor in NoteItemViewModel state).

After switch:
- `notebookEditor.updateNoteEditor(noteId, newEditorId)` writes the new editor id to `note.content.editor`.
- The notebook's `onDataChangedDebounced` flushes the updated JSON to the host.
- The new embedded editor's `EditorView` renders inside the note row.

**First and only consumer of `switchEditorViaContentHost` at a second-level (non-page) owner.** The mechanism is identical to the page-level three-phase switch — the only difference is the owner of the switch (NoteItemViewModel vs. PageModel). Demonstrates that the EPIC-028 contract is fully composable: nothing in the switch protocol requires the wrapper to be a PageModel specifically.

**`EditorConstructorArgs.initialHost: IContentHost | undefined` becomes the canonical mechanism for injecting a pre-existing host at construction** — cleaner than the C4-proposed `setContentHost()` separate-call shape (keeps host adoption at the only place the host can be adopted: construction). Top-level page-owned editors don't pass `initialHost` and create their host inside `restore()`; nested editors pass the wrapping host and skip the construction branch.

Rejected (b) keep per-note switch widget at the global notebook toolbar — violates C5 resolution; user can be working with multiple notes of different preferred views simultaneously; a global toolbar can't represent that; (c) skip switch widget entirely and rely on right-click menu — per-note view choice is a primary affordance, not a hidden action; discoverability matters; today's `<EditorSwitchWidget>` is a known UX pattern across Persephone.

### NB8 — NoteItemEditModel stateStorage backed by `notebook.data.state[id]`

**RESOLVED 2026-05-20** — Option (a) confirmed. Preserve verbatim. Per-note state (Grid column widths, search filters in a note rendered as Markdown with search, etc.) lives **inside the notebook JSON file**, NOT in a separate cache file.

Rationale: per-note state is LOGICALLY part of the note (survives when the notebook moves across windows, gets shared, gets restored on a different machine via cloud sync, etc.). A cache file would orphan when the notebook moves. Same logical pattern as TD7's `data.state[id].contentHeight` but generalized — `NotebookViewModel.setNoteState(id, name, value)` accepts arbitrary string keys.

**Symmetry with non-notebook editors:** A standalone Grid editor (top-level page) writes its column widths into `EditorDescriptor.state` via the descriptor mechanism. A Grid editor *inside a note* writes its column widths into `notebook.data.state[noteId][name]` via NoteItemEditModel.stateStorage. **Both pathways converge on the same destination: a state slice serialized somewhere durable that survives restart, window transfer, and cross-machine sync.** The difference is just WHERE the durable serialization lives — the editor descriptor (for top-level pages) vs. the notebook JSON file (for nested notes).

Rejected (b) move per-note state to a separate cache file per-note keyed by `<notebook.editorId>-<noteId>` — orphans when notebook moves; breaks cross-window survival; adds dozens of tiny cache files for a notebook with dozens of notes.

### NB9 — Drag-and-drop traits

**RESOLVED 2026-05-20** — Option (a) confirmed. Preserve all three trait systems verbatim:

1. `TraitTypeId.Note` (emit by NoteItemView for cross-category drag).
2. `TraitTypeId.NotebookCategory` (emit + accept by category tree).
3. `LINK` trait (accept by category tree for cross-editor link drops from PageNavigator).

Same as TD9 / RC9 — drag traits orthogonal to EditorModel traits. Notebook is the **richest trait consumer in the Tier 5 set** — three active trait types vs. Link/RestClient's two. Documents the architectural property that drag traits scale to per-editor needs without requiring framework changes.

Rejected (b) merge `Note` + `NotebookCategory` into a single `Notebook*` trait type — payload shapes differ (Note carries `{ noteId }`, Category carries `{ category }`); merging forces a discriminated union with no benefit.

### NB10 — Registration + queue events + scripting facade decision

**RESOLVED 2026-05-20** — Option (a) confirmed.

- `accepts({host, fileName, language})` predicate: filename `.note.json` priority 70 + content-peek (`"type": "note-editor"` AND `"notes"`) priority 60 — drops the today's quartet (`acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent`) per the standard collapse. Mirrors LV10/GR10/LK10/TD10/RC10 across all nine Tier 5 editors.
- Queue event union: `{ type: "focus" }` only. Queue request: `never`.
- **Defer scripting facade.** Matches Rest Client's RC10 deferral. **Second instance** of "text-bearing Tier 5 editor without a scripting facade." With two instances, the asymmetry is documented as **intentional**: scripting facades are opt-in per editor, not required by the Tier 5 template. Adding `NotebookEditorFacade.ts` + `api/types/notebook-editor.d.ts` + `page.asNotebook(force?)` is a mechanical 4-file touch deferred until a real consumer lands.

Rejected (b) ship the scripting facade now — no consumer; YAGNI; documents asymmetry as deliberate; (c) reject content-peek calibration — matches all eight prior calibrations.

---

## Mockup adjustments

**Zero changes** — Tier 5 template + IContentHost mockup carry NotebookEditor + NoteItemEditModel end-to-end without modification:

- `EditorModel.ts` mockup — unchanged. The `EditorConstructorArgs.initialHost` field already exists in the mockup (added by walkthrough 04 / P6 for the restore path). NB7's per-note construction uses the same field.
- `IContentHost.ts` mockup — unchanged. The interface as sketched (no acquireViewModel/releaseViewModel/prepareViewModel; only id + state + changeContent + changeLanguage + setStorage + dispose + getDescriptor + handleKeyDown?) is exactly what post-NB6 NoteItemEditModel implements.
- `editorRegistry.ts` mockup — unchanged. `findEditorsAccepting(host)` works at both page-level (top-level editor switch) and note-level (per-note switch widget option list).

This is the **seventh template-confirmation walkthrough in a row** (after Grid / Preview group / Log View / Link / Todo / Rest Client / Notebook) — the Tier 5 template + IContentHost mockup are now confirmed stable across:

- nine editors with `CONTENT_HOST_TRAIT` (Tier 5 set).
- two host implementations (TextFileModel + NoteItemEditModel).
- two switch scopes (page-level + per-note).
- three sidebar topologies (sidebar-owning Link / non-sidebar-owning Grid-Todo-RC-Notebook / future-no-host walkthrough 30 group).

If all NB1–NB10 land at recommendation (a), the next walkthrough is 30 — No-host editors (PDF, image, archive, video, browser, settings, about, mcp-inspector, storybook, compare, category, explorer).

---

## Migration scope

> **AMENDED 2026-05-24 — US-557 outer-only scope splits this section.** US-557 ships only the outer NotebookEditor (page-level). The inner per-note dispatch / NoteItemEditModel decomposition / ContentViewModelHost deletion / NoteEditorModel sub-class deletion / preserved-sibling retirement all land under [US-579](../../../tasks/US-579-notebook-inner-per-note-migration/README.md) (Phase D, before US-559). Under US-557 outer-only:
>
> **US-557 New files (outer-only):**
> - `src/renderer/editors/notebook/NotebookEditor.ts` — v4 class with TextFileModel host
> - `src/renderer/editors/notebook/NotebookBody.tsx` — v4 view body (no chrome)
> - `src/renderer/editors/notebook/index.tsx` — `notebookModule: EditorModule` + TextChrome wrapper
>
> **US-557 Renamed:** `NotebookEditor.tsx` → `NotebookView.tsx` (legacy view preserved; matches the established preserved-sibling pattern from US-554 onward).
>
> **US-557 NOT deleted (preserved until US-579 / US-559):** `NotebookViewModel.ts`, `ContentViewModelHost.ts`, `NoteEditorModel` sub-class, portal refs on NoteItemEditModel, compatibility properties on NoteItemEditModel, `acquireViewModel*` methods on NoteItemEditModel, `_vmHost: ContentViewModelHost` field.
>
> **US-557 Modified (outer-only):** `notebookTypes.ts` (add `NotebookSource` union), `NoteItemViewModel.ts` (one-line type widening), `note-editor/NoteItemEditModel.ts` (one-line type widening — `notebookModel: NotebookViewModel` → `NotebookSource`), `register-editors.ts` (remove `notebook-view` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; add native v4 register block; update legacy `loadModule` to import `./notebook/NotebookView`), `PagesLifecycleModel.ts` (add `notebook-view` branch in `wrapLegacyForPage`).
>
> **Original walkthrough scope (now US-579's territory) kept for reference below:**

Real-code only. No new framework primitive.

**New files:**
- `src/renderer/editors/notebook/NotebookEditor.ts` — class + `NotebookEditorState` + `NotebookQueueEvent` + all mutators ported from today's `NotebookViewModel.ts`.
- `src/renderer/editors/notebook/NotebookEditorView.tsx` — composes `<TextChrome>` + `<NotebookBody>`.

**Renamed files:**
- `NotebookEditor.tsx` → `NotebookBody.tsx` (today's React component body; receives `editor: NotebookEditor` prop instead of `model: TextFileModel`).

**Deleted files:**
- `NotebookViewModel.ts` — all state + mutators + serialization + filtering absorb into `NotebookEditor.ts`.
- `src/renderer/editors/base/ContentViewModelHost.ts` — last consumer dissolves with NB6 (TextFileModel ditched its `_vmHost` in earlier walkthroughs; NB6 ditches NoteItemEditModel's `_vmHost` — leaving zero consumers).

**Heavy edit:**
- `note-editor/NoteItemEditModel.ts` — ~70 LOC down from ~375 LOC. Strips view-model machinery, portal refs, NoteEditorModel sub-class, compatibility properties. Implements new IContentHost interface (getDescriptor / setStorage / dispose). Moves `runScript` to use embedded editor's `getSelectedText` via the standard `getSelectedText()` method on text-bearing EditorModels (when present).
- `NoteItemViewModel.ts` — adds `_embeddedEditor: EditorModel | null` field + `embeddedEditor` getter + `switchNoteEditor` method + dispose hook for embedded editor.
- `NoteItemView.tsx` — adds per-note `<EditorSwitchWidget>` + renders `<embeddedEditor.View>`.
- `register-editors.ts` (lines 271-307) — swap factory to EditorModel; drop `acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent` quartet in favor of single `accepts()` per NB10.

**Verbatim port:**
- `notebookTypes.ts` (NoteItem, NoteContent, NotebookData, NoteItemState).
- `ExpandedNoteView.tsx`, `TagsListView.tsx`, `category-tree.tsx`.
- `note-editor/NoteItemActiveEditor.tsx`, `note-editor/NoteItemToolbar.tsx`, `note-editor/MiniTextEditor.tsx` — minor type renames (`vm: NoteItemEditModel` references stay).

**Deletes:**
- `note-editor/NoteEditorModel` (the inner Monaco-specific sub-class today at the top of NoteItemEditModel.ts) — Monaco-specific selection/height/highlight machinery relocates into the embedded MonacoEditor. The `NoteEditorState` type also deletes.

**Persistence migration:** zero per C2. Today's `.note.json` file format is **unchanged** — `data.notes[].content.editor` still stores the preferred editor id per note; `data.state[id]` still carries per-note state. Old notebook files open in the new editor with no transformation.

**NO new facade or `api/types/notebook-editor.d.ts`** per NB10 — Notebook joins Rest Client as the second text-bearing Tier 5 editor without a scripting facade.

---

## Closure

**Outcomes table:**

| # | Status | Resolution |
|---|--------|------------|
| NB1 | ✅ RESOLVED | NotebookEditor IS mainEditor + TextFileModel host — **ninth Tier 5 editor** in uniform shape. |
| NB2 | ✅ RESOLVED | State slice: 4 persisted / 8 ride-state stripped / 1 transient; `leftPanelWidth` + `expandedPanel` + `selectedCategory` + `selectedTag` silent today-bug incidentally fixed — **fourth instance** (LK2 → TD2 → RC2 → NB2). |
| NB3 | ✅ RESOLVED | New persistence ADDED via descriptor — **sixth instance** of pattern at the destination (Grid GR4 → LV3 → LK3 → TD3 → RC3 → NB3); pattern standardized across **six of nine** Tier 5 editors. |
| NB4 | ✅ RESOLVED | Three-site lifecycle split — **fifth Tier 5 editor** (LV4 → LK4 → TD4 → RC4 → NB4). |
| NB5 | ✅ RESOLVED | `skipNextContentUpdate` self-write guard — **fifth instance** (LV6 → LK5 → TD5 → RC5 → NB5); pattern fully solidified; options (b) and (c) architecturally retired. |
| NB6 | ✅ RESOLVED | NoteItemEditModel decomposition — **resolves C4**; `ContentViewModelHost.ts` deletes entirely from the codebase (last consumer dissolves); NoteItemEditModel ~70 LOC down from ~375. |
| NB7 | ✅ RESOLVED | Per-note embedded EditorModel + per-note switch widget — **resolves C5**; **first and only consumer of `switchEditorViaContentHost` at a second-level owner**; `EditorConstructorArgs.initialHost` is the canonical injection mechanism (supersedes C4's tentative `setContentHost()` proposal). |
| NB8 | ✅ RESOLVED | Per-note state in JSON file (NOT cache file) — preserves cross-window/cross-machine survival; both pathways (standalone-editor descriptor + nested-editor JSON-embedded) converge on durable serialization. |
| NB9 | ✅ RESOLVED | Three trait systems verbatim (Note + NotebookCategory + LINK) — **richest trait consumer in Tier 5**. |
| NB10 | ✅ RESOLVED | Registration via `accepts()` (filename `.note.json` p70 + content-peek p60); queue `{ focus }` only; **defer scripting facade** — **second instance of deferred-facade** (after RC10); documents asymmetry as intentional. |

**Cross-walkthrough cleanups:**
1. `src/renderer/editors/base/ContentViewModelHost.ts` deletes — last consumer dissolves (TextFileModel ditched `_vmHost` in earlier walkthroughs; NB6 ditches NoteItemEditModel's `_vmHost`, leaving zero consumers).
2. Final `acquireViewModelSync` cleanup on `NoteItemEditModel.ts` — completes LV9's "(also touched by walkthrough 29)" deferred work.
3. `NoteEditorModel` (Monaco-specific sub-class in NoteItemEditModel.ts) deletes — Monaco machinery relocates into the embedded MonacoEditor.
4. `EditorConstructorArgs.initialHost` becomes the canonical mechanism for pre-existing host injection — supersedes C4's tentative `setContentHost()` proposal.
5. `ContentViewModelHost` references in mockup `IContentHost.ts` comments — remove (machinery is gone).
6. **C4 and C5 in concerns.md are now FULLY EXERCISED** by walkthrough 29's NB6 / NB7 — they remain marked "Resolved 2026-05-19" with the original high-level resolutions, and NB6 / NB7 codify the implementation-level specifics they pointed at.

**Implementation notes:**
- Per-note switch is the only place in the codebase that invokes the three-phase switch from React component code (vs. PageModel.setMainEditor at top-level). The mechanism is the same; only the caller differs.
- `EditorConstructorArgs.initialHost` is mandatory for nested editors but optional for top-level editors. Top-level editors construct then create their host inside `restore()`; nested editors construct with `initialHost` and skip the host-construction branch of `restore()`.
- `notebook.data.state[id]` is **the largest carve-out of "editor state inside file format" in the codebase**. The per-note state can hold arbitrary string keys (column widths, search state, anything an editor wants). This was a deliberate design decision in the original notebook implementation and remains correct under EPIC-028 — it survives cross-window page transfer (M5/P6 instanceId pathway) and cross-machine sync (the JSON file moves whole).
- Notebook's `accepts()` content-peek runs on a notebook file's content which can be megabytes. The peek tests against the first ~few hundred bytes of the JSON (the regex against `"type"\s*:\s*"note-editor"` matches early in the file given the JSON.stringify output structure). Calibration with prior walkthroughs is acceptable; no special handling needed.
- Notebook editors do NOT participate in cross-window page transfer differently from any other Tier 5 editor — the notebook page transfers as a single unit (host + editor descriptor); per-note state survives because it's inside the host content.
- Walkthroughs 27 (Graph) and 28 (Draw) skipped for design phase by user decision — both editors have structurally similar shapes to the eight prior Tier 5 editors; will be investigated first-principles during implementation.

**Cross-walkthrough cleanups (on acceptance):**
1. `ContentViewModelHost.ts` deletes — last consumer dissolves.
2. Final `acquireViewModelSync` cleanup on `NoteItemEditModel.ts` — completes LV9's "(also touched by walkthrough 29)" deferred work.
3. `NoteEditorModel` (Monaco-specific sub-class in NoteItemEditModel.ts) deletes — Monaco machinery relocates into the embedded MonacoEditor.
4. `EditorConstructorArgs.initialHost` becomes the canonical mechanism for pre-existing host injection — supersedes C4's tentative `setContentHost()` proposal.
5. `ContentViewModelHost` references in mockup `IContentHost.ts` comments — remove (machinery is gone).

**Implementation notes:**
- Per-note switch is the only place in the codebase that invokes the three-phase switch from React component code (vs. PageModel.setMainEditor at top-level). The mechanism is the same; only the caller differs.
- `EditorConstructorArgs.initialHost` is mandatory for nested editors but optional for top-level editors. Top-level editors construct then create their host inside `restore()`; nested editors construct with `initialHost` and skip the host-construction branch of `restore()`.
- `notebook.data.state[id]` is **the largest carve-out of "editor state inside file format" in the codebase**. The per-note state can hold arbitrary string keys (column widths, search state, anything an editor wants). This was a deliberate design decision in the original notebook implementation and remains correct under EPIC-028 — it survives cross-window page transfer (M5/P6 instanceId pathway) and cross-machine sync (the JSON file moves whole).
- Notebook's `accepts()` content-peek runs on a notebook file's content which can be megabytes. The peek tests against the first ~few hundred bytes of the JSON (the regex against `"type"\s*:\s*"note-editor"` matches early in the file given the JSON.stringify output structure). Calibration with prior walkthroughs is acceptable; no special handling needed.
- Notebook editors do NOT participate in cross-window page transfer differently from any other Tier 5 editor — the notebook page transfers as a single unit (host + editor descriptor); per-note state survives because it's inside the host content.

**Next walkthrough:** Walkthrough 30 — No-host editors (PDF, image, archive, video, browser, settings, about, mcp-inspector, storybook, compare, category, explorer). The first walkthrough in the **no-host group**: editors that do NOT have a CONTENT_HOST_TRAIT and don't wrap a TextFileModel/NoteItemEditModel. Pre-check needed for each: how does it fit `EditorModel` without a host? Explorer is special — it is registered as a secondary-only editor and is therefore the **second sidebar-owning editor** in EPIC-028 (would validate Link's LK7+LK8+LK9 recipe across two consumers).
