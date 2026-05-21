# Todo walkthrough

> **Status:** Done 2026-05-20. Tier 5 per-editor walkthrough — Todo editor (`.todo.json` files). All ten concerns (TD1–TD10) RESOLVED. **Zero mockup changes** — fifth template-confirmation walkthrough in a row (after Grid, Preview group, Log View, Link). **Topology correction:** walkthrough 24's closure predicted Todo would be the "second sidebar-owning editor" — that was wrong. Todo registers no secondary editors and renders its lists/tags panel **inline** inside the editor body. So the LK7 / LK8 / LK9 recipe (`beforeNavigateAway` + `onMainEditorChanged` + TreeProvider) does NOT apply here; the recipe stays at one example (Link) until a true second sidebar-owner lands (likely walkthrough 30 / Explorer or Archive in the no-host group).

Walkthrough 25 finalizes `TodoEditor` — the Todo collection editor under EPIC-028. Todo is the **seventh Tier 5 editor** in the uniform "EditorModel IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT" shape. Its topology is the simplest variant: in-editor left panel (lists + tags) + center content grid, no sidebar editors, no panel-mode multiplexing. Same JSON-self-write pattern as Log View (LV6) and Link (LK5) — third instance. Same per-editor cache file → descriptor.state pattern as Grid / Log View / Link — fourth instance.

---

## State today

`src/renderer/editors/todo/` is a self-contained folder of 6 files:

| File group | Contents |
|------------|----------|
| Core | `TodoViewModel.ts`, `TodoEditor.tsx`, `todoTypes.ts`, `todoColors.ts` |
| Components | `components/TodoListPanel.tsx`, `components/TodoItemView.tsx` |

### Today's ViewModel state shape

```typescript
const defaultTodoEditorState = {
    data: { lists: [], tags: [], items: [], state: {} } as TodoData,
    error: undefined as string | undefined,
    leftPanelWidth: 200,
    // Lists (derived from data.items):
    listCounts: {} as { [listName: string]: ListCount },
    selectedList: "" as string,                   // empty = "All"
    // Tags
    selectedTag: "" as string,                    // empty = "All Tags"
    // Filtering
    searchText: "" as string,
    filteredItems: [] as TodoItem[],
};
```

Eight fields total.

### Today's `TodoData` shape (root of `.todo.json`)

```typescript
interface TodoData {
    lists: string[];
    tags: TodoTag[];
    items: TodoItem[];
    /** Per-item UI state, keyed by item id */
    state: { [itemId: string]: { contentHeight?: number } };
}
```

`data.state[id].contentHeight` is **per-item UI state that persists inside the JSON file** — used to size virtualized grid rows on first render. Logical per-item, not per-window — survives across windows because it's tied to the item, not the viewing window.

### Today's private fields

| Field | Purpose |
|-------|---------|
| `lastSerializedData: TodoData \| null` | Reference-equality marker — skips serialization when `state.data` hasn't been swapped, AND when only ephemeral subfields (heights) change |
| `skipNextContentUpdate: boolean` | Self-write guard — set when the VM serializes its own state to JSON so `onContentChanged` doesn't re-parse what we just wrote (same shape as Log View / Link) |
| `lastFilterState` | Incremental-search optimization — caches `{ searchText, selectedList, selectedTag }` so search-extension can filter the previous result without rescanning all items |
| `selectionRestored: boolean` | One-shot flag — restores `<host.id>-todo-editor` cache file (`selectedList` / `selectedTag`) on first `loadData` |
| `static cacheName = "todo-editor"` | Cache file basename |

### Today's lifecycle entry points

- `onInit()` — subscribes `state` → debounced `onDataChangedDebounced` (300ms); reads `host.state.content`; calls `loadData(content)` (which kicks off `restoreSelectionState` async).
- `onContentChanged(content)` — guards on `skipNextContentUpdate` flag; otherwise re-parses via `loadData(content)`.
- `onDispose()` — flushes pending debounced save (`this.onDataChanged()`).

### Today's JSON self-write pattern (same as LV6 / LK5)

1. User mutates state (`addItem`, `toggleItem`, `setSelectedList`, `setItemHeight`, …) → `state.update(…)` fires subscribers.
2. Debounced `onDataChangedDebounced` (300ms) calls `onDataChanged`:
   - Reads `state.data` + `state.error`; if `error` is set, returns (preserves user's raw content during parse failure).
   - Compares `data.items / data.lists / data.tags` against `lastSerializedData` by reference — short-circuits when only `data.state` (heights) changed; today's note in the code explicitly calls out this avoidance of "ResizeObserver height measurements marking the file as modified."
   - Sets `skipNextContentUpdate = true`.
   - Serializes JSON: `{ type: "todo-editor", lists, tags, items, state }`.
   - Calls `host.changeContent(content, true)` — `true` = "set modified flag".
3. Host content subscription fires `onContentChanged(content)`:
   - Sees `skipNextContentUpdate === true` → resets to false, returns without re-parsing.

External changes (user edits the JSON in another editor, file reload, etc.) hit `onContentChanged` without the flag set → `loadData` re-parses.

**Subtle invariant:** `data.state` (per-item heights) IS serialized into the JSON file but does NOT participate in the reference-equality short-circuit. So height changes propagate to disk via the `state.subscribe` → debounced save path, BUT only piggyback on a save triggered by an `items` / `lists` / `tags` reference change — never trigger a save on their own. In practice this means heights get persisted when any other meaningful edit happens, and stay in-memory between such edits. Edge case (write a height, then close the file without any other edit): height is lost. Today this is accepted noise.

### Today's selection-state cache

Today's `<host.id>:todo-editor` cache file (via `host.stateStorage.setState(host.id, "todo-editor", JSON.stringify(...))`) stores two fields:
```typescript
{ selectedList, selectedTag }
```
- **Read** in `restoreSelectionState` (called once during the first `loadData` via `selectionRestored` one-shot guard).
- **Written** in `saveSelectionState` (debounced 300ms, fired by `setSelectedList` / `setSelectedTag`).

Two parallel persistence channels: the JSON file (todo data + per-item heights + lists + tags) and the cache file (per-window UI selection state). Same shape Grid had pre-GR4, Log View had pre-LV3, Link had pre-LK3.

### Today's view-side machinery (`TodoEditor.tsx`)

- `useContentViewModel<TodoViewModel>(model, "todo-view")` — ref-counted acquire/release (SF2 target; the last text-bearing consumer alongside Rest Client by walkthrough 23's SF2 cleanup chain).
- `useSyncExternalStore` over `vm.state` for reactive read.
- `gridModelRef` (RenderGridModel ref) + `setGridModel` callback ref.
- `useEffect` triggers `gridModelRef.current?.update({ all: true })` when `items` or `tags` change — forces full grid re-measure.
- `separatorIndex` useMemo computes the row index of the "Done" separator (first done item's index, if any).
- `rowCount = items.length + (separatorIndex >= 0 ? 1 : 0)` — separator gets its own virtual row.
- `getItemForRow(row)` translates virtual row index → real item (accounting for separator).
- `getInitialRowHeight(row)` reads per-item height from `vm.getItemHeight(item.id)` — drives RenderFlexGrid initial sizing.
- Quick-add row (Input + IconButton) at top of center panel; disabled when no list selected ("Select a list to add items...").
- Portal-based contributions: search Input → `model.editorToolbarRefLast`; item count → `model.editorFooterRefLast` (both relocate per walkthrough 09 / 10).
- Empty states: zero items globally ("Create a list, then add your first todo item"), zero matching filter ("No items match the current filter").
- Resizable left panel via `Splitter` calling `vm.setLeftPanelWidth(w)` — width lives in VM state but is NOT persisted today (silent today-bug, same shape as Link's `leftPanelWidth` per LK2).

### Today's TodoListPanel (in-editor left panel)

`components/TodoListPanel.tsx` renders inside `TodoEditor.tsx` — NOT a registered secondary editor. Contains:
- "New list..." Input + Add button.
- Lists section: "All" row + per-list `RowShell` (with rename + delete IconButtons on hover, count badge).
- Tags section: "All Tags" row + per-tag `RowShell` (with rename + delete IconButtons on hover, color Dot, color-change WithMenu).
- "New tag..." Input + Add button at bottom.

The panel is purely a view layer — every action delegates to `vm.addList / vm.renameList / vm.deleteList / vm.addTag / vm.renameTag / vm.deleteTag / vm.updateTagColor / vm.setSelectedList / vm.setSelectedTag`. No model-side reference to "panel" anywhere.

### Today's TodoItemView (item row with comment + tag + drag handle)

`components/TodoItemView.tsx` renders a single item:
- Checkbox (`CheckedIcon` / `UncheckedIcon`) → `vm.toggleItem(item.id)`.
- Title `Textarea` (single-line if no comment, multi-line if comment expanded) → `vm.updateItemTitle(item.id, t)`.
- Optional `Textarea` for comment → `vm.updateItemComment(item.id, c)` / `vm.removeComment(item.id)`.
- Tag chip with color Dot + WithMenu for tag re-selection → `vm.setItemTag(item.id, name)`.
- Drag handle (when undone) → uses `TraitTypeId.TodoItem` (`setTraitDragData` / `getTraitDragData` / `hasTraitDragData`).
- Delete IconButton (hidden until hover) → `vm.deleteItem(item.id)`.
- Reorder via HTML5 drag-and-drop → `vm.moveItem(fromId, toId)`.
- Height measurement via ResizeObserver → `vm.setItemHeight(item.id, h)`.

### Today's registration (`register-editors.ts:388-422`)

```typescript
editorRegistry.register({
    id: "todo-view",
    name: "ToDo",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) =>
        matchesPattern(fileName, /\.todo\.json$/i) ? 20 : -1,
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) =>
        languageId === "json" && matchesPattern(fileName, /\.todo\.json$/i) ? 10 : -1,
    isEditorContent: (languageId, content) =>
        languageId === "json" &&
        content.includes('"type"') &&
        /"type"\s*:\s*"todo-editor"/.test(content) &&
        content.includes('"items"'),
    loadModule: async () => {
        const [module, { createTodoViewModel }] = await Promise.all([
            import("./todo/TodoEditor"),
            import("./todo/TodoViewModel"),
        ]);
        return {
            Editor: module.TodoEditor,
            createViewModel: createTodoViewModel,
            newEditorModel: textEditorModule.newEditorModel,
            newEmptyEditorModel: textEditorModule.newEmptyEditorModel,
            newEditorModelFromState: textEditorModule.newEditorModelFromState,
        };
    },
});
```

No secondary editor registrations — Todo is not in `secondary-editor-registry.ts`.

### Today's scripting facade (`TodoEditorFacade.ts`)

Thin wrapper around TodoViewModel:
- `items / lists / tags` getters — read snapshots (TodoItem → `{id, title, completed, list, tag}` projection).
- `addItem(title) / toggleItem(id) / deleteItem(id) / updateItemTitle(id, title)` — delegates.
- `addList / renameList / deleteList / addTag` — delegates.
- `selectList / selectTag / setSearch / clearSearch` — delegates.
- `deleteItem(id)` and `deleteList(name)` call vm methods with `skipConfirm=true` (script API bypasses dialogs).

---

## State after refactor

`TodoEditor` is the page's `mainEditor` under EPIC-028 (TD1 — direct, not a content-view atop TextFileModel). The class HAS a `TextFileModel` as its `IContentHost`, same shape as Monaco / Grid / Markdown / Mermaid / LogView / Link (seventh Tier 5 editor in this uniform shape). Selection-state cache file retires (TD3 — fourth instance of cache-file → descriptor.state). No sidebar-owning topology; no `beforeNavigateAway` / `onMainEditorChanged` overrides.

### Class sketch

```typescript
class TodoEditor extends EditorModel<TodoEditorState, void, TodoQueueEvent> {
    readonly editorId = "todo-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;

    // Self-write guard (TD5 — third instance after LV6, LK5):
    private skipNextContentUpdate = false;
    // Reference-equality marker for serialization skip:
    private lastSerializedData: TodoData | null = null;
    // Incremental-filter optimization (today's pattern):
    private lastFilterState = { searchText: "", selectedList: "", selectedTag: "" };
    // View refs (set via setters from view; not on state):
    private _gridModel: RenderGridModel | null = null;

    // Save debounce — today's pattern:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    constructor(state: TComponentState<TodoEditorState>) {
        super(state);
        this.traits.set(CONTENT_HOST_TRAIT, {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from TodoEditor");
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

    // ── Persistence (TD2 + TD3) ────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            ...super.getRestoreData(),
            state: {
                id: s.id,
                title: s.title,
                modified: s.modified,
                // Per-editor persisted UI slice (TD3 — fourth instance of cache-file → descriptor.state):
                leftPanelWidth: s.leftPanelWidth,
                selectedList: s.selectedList,
                selectedTag: s.selectedTag,
                // Stripped (derived from data.items — recomputed on restore via loadListCounts + applyFilters):
                //   listCounts, filteredItems
                // Stripped (transient UI state):
                //   searchText, error
                // Stripped (derived from host.content):
                //   data
            },
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<TodoEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined)         cur.title = data.title;
            if (data.modified !== undefined)      cur.modified = data.modified;
            if (data.leftPanelWidth !== undefined) cur.leftPanelWidth = data.leftPanelWidth;
            if (data.selectedList !== undefined)  cur.selectedList = data.selectedList;
            if (data.selectedTag !== undefined)   cur.selectedTag = data.selectedTag;
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
            this.loadData(this._host.state.get().content || "");        // TD4 — initial parse
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Todo editor.", "error");
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
        // TD4 + TD5 — host content subscription drives re-parse, guarded by self-write flag.
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

    // ── JSON parse/serialize (TD4 / TD5 — verbatim from today's TodoViewModel) ──

    private loadData(content: string): void { /* ... same as today's TodoViewModel.loadData */ }
    private onDataChanged = () => { /* ... same as today; sets skipNextContentUpdate before host.changeContent */ };

    // ── State mutators (today's setters preserved; TodoEditorFacade contract preserved) ──

    setSelectedList = (listName: string): void => { /* … */ };
    setSelectedTag  = (tagName: string): void => { /* … */ };
    setSearchText   = (text: string): void => { /* … */ };
    clearSearch     = (): void => { /* … */ };
    setLeftPanelWidth = (w: number): void => { /* … */ };

    // Item CRUD — verbatim (addItem, toggleItem, updateItemTitle, addComment,
    //   updateItemComment, removeComment, deleteItem, moveItem, setItemTag).
    // List CRUD — verbatim (addList, renameList, deleteList).
    // Tag CRUD — verbatim (addTag, renameTag, deleteTag, updateTagColor, getTag).
    // Item-height persistence — verbatim (getItemHeight, setItemHeight).

    // ── Optional overrides ─────────────────────────────────────────────

    focus(): void { this.queue.send({ type: "focus" }); }

    async saveState(): Promise<void> {
        // Flush pending debounced save before host's saveState
        this.onDataChanged();
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        // Flush pending debounced save (today's onDispose pattern)
        this.onDataChanged();

        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._hostStateUnsub = this._hostContentUnsub = null;
        this._gridModel = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }

    // ── View refs (set by view; not on state) ──────────────────────────

    setGridModel(model: RenderGridModel | null): void { this._gridModel = model; }
}
```

### State slice shape (TD2)

```typescript
interface TodoEditorState extends EditorStateBase {
    // Persisted (TD3 — folded into EditorDescriptor.state, replacing today's cache file):
    leftPanelWidth: number;
    selectedList: string;
    selectedTag: string;
    // View-derived — ride state for reactivity, stripped from getRestoreData (MO5 / GR8 / LV2 / LK2 pattern):
    data: TodoData;                          // ← derived from host.content (recomputed via loadData)
    listCounts: { [listName: string]: ListCount };  // ← derived from data.items
    filteredItems: TodoItem[];               // ← derived from data + selectedList + selectedTag + searchText
    error: string | undefined;
    // Transient UI state — not persisted (matches today's behavior):
    searchText: string;
}
```

Eight fields total: **3 persisted / 4 ride-state stripped / 1 transient**. Today's 8-field state stays at 8 fields under refactor — the partitioning is purely about how each field gets persisted, not about what fields exist.

The persisted slice is intentionally small (one `number`, two `string` selection fields — total ~60 bytes typical, ~200 bytes worst case for very long list / tag names). Well under M9's 50KB per-page budget.

### Queue event union (TD10)

```typescript
type TodoQueueEvent = { type: "focus" };       // MO7 — chrome's root-focus follows

// Queue request: never  (script API reads are sync against editor state;
// no view-context queries needed — same as Grid GR10 / Log View LV9 / Link LK10)
```

---

## UI shape

```typescript
function TodoEditorView({ model }: { model: TodoEditor }) {
    return (
        <TextChrome
            model={model}
            toolbarContributions={<TodoToolbarBits model={model} />}
            footerContributions={<TodoFooterBits model={model} />}
        >
            <TodoBody model={model} />
        </TextChrome>
    );
}

function TodoBody({ model }: { model: TodoEditor }) {
    const state = model.state.use((s) => ({
        data: s.data, error: s.error, leftPanelWidth: s.leftPanelWidth,
        listCounts: s.listCounts, selectedList: s.selectedList, selectedTag: s.selectedTag,
        filteredItems: s.filteredItems, searchText: s.searchText,
    }));
    const [quickAddText, setQuickAddText] = useState("");

    // Grid re-measure on items / tags reference change (today's pattern).
    useEffect(() => {
        model.gridModel?.update({ all: true });
    }, [state.filteredItems, state.data.tags]);

    // TD11 (focus event handler — same shape as MO7 / GR10 / LV8 / LK11):
    model.queue.use((ev) => {
        if (ev.type === "focus") {
            // Today's TodoEditor has no explicit refocus; queue is currently unused.
            // Kept for symmetry with the Tier 5 template; harmless no-op for now.
        }
    });

    if (state.error) return <EditorError>{state.error}</EditorError>;

    const separatorIndex = computeSeparatorIndex(state.filteredItems);
    const rowCount = state.filteredItems.length + (separatorIndex >= 0 ? 1 : 0);

    return (
        <Panel name="todo-root" direction="row" flex={1} overflow="hidden">
            <Panel name="todo-left-panel" /* … */ width={state.leftPanelWidth}>
                <TodoListPanel
                    model={model}
                    lists={state.data.lists}
                    selectedList={state.selectedList}
                    listCounts={state.listCounts}
                    tags={state.data.tags}
                    selectedTag={state.selectedTag}
                />
            </Panel>
            <Splitter
                name="todo-splitter"
                orientation="vertical"
                value={state.leftPanelWidth}
                onChange={model.setLeftPanelWidth}
                border="after"
                min={100}
            />
            <Panel name="todo-content" direction="column" flex={1} minWidth={0} overflow="hidden">
                <Panel name="todo-quick-add-row" /* … */>
                    <Textarea
                        name="todo-quick-add"
                        value={quickAddText}
                        onChange={setQuickAddText}
                        singleLine
                        placeholder={state.selectedList ? "Add new todo item..." : "Select a list to add items..."}
                        readOnly={!state.selectedList}
                    />
                    <IconButton onClick={() => { model.addItem(quickAddText.trim()); setQuickAddText(""); }} … />
                </Panel>

                {state.data.items.length === 0
                    ? <EmptyState text="No items yet. Create a list, then add your first todo item." />
                    : state.filteredItems.length === 0
                        ? <EmptyState text="No items match the current filter" />
                        : <RenderFlexGrid
                            ref={model.setGridModel}
                            columnCount={1}
                            rowCount={rowCount}
                            columnWidth={getColumnWidth100Percent}
                            renderCell={(p) => renderTodoCell(model, state.filteredItems, separatorIndex, state.data.tags, p)}
                            fitToWidth
                            minRowHeight={34}
                            maxRowHeight={400}
                            getInitialRowHeight={(row) => {
                                const item = getItemForRow(state.filteredItems, separatorIndex, row);
                                return item ? model.getItemHeight(item.id) : undefined;
                            }}
                        />}
            </Panel>
        </Panel>
    );
}

function TodoToolbarBits({ model }: { model: TodoEditor }) {
    const searchText = model.state.use((s) => s.searchText);
    return (
        <Input
            name="todo-search"
            value={searchText}
            onChange={model.setSearchText}
            placeholder="Search..."
            endSlot={searchText
                ? <IconButton name="todo-search-clear" size="sm" icon={<CloseIcon />} title="Clear search" onClick={model.clearSearch} />
                : null}
        />
    );
}

function TodoFooterBits({ model }: { model: TodoEditor }) {
    const { filteredCount, totalCount } = model.state.use((s) => ({
        filteredCount: s.filteredItems.length,
        totalCount: s.data.items.length,
    }));
    return <span>{filteredCount === totalCount ? `${totalCount} items` : `${filteredCount} of ${totalCount} items`}</span>;
}
```

### `accepts()` (registry) — TD10

```typescript
accepts({ host, fileName, language }): number {
    if (fileName && /\.todo\.json$/i.test(fileName)) return 70;     // strong filename match
    if (language === "json" && host) {
        const content = host.state.get().content;
        if (content.includes('"type"') && /"type"\s*:\s*"todo-editor"/.test(content) && content.includes('"items"')) {
            return 60;                                                // content-peek fallback
        }
    }
    return -1;
}
```

Replaces today's `acceptFile` (filename) + `validForLanguage` (language) + `switchOption` (language + filename) + `isEditorContent` (language + content peek) quartet with the single `accepts` predicate. Same priority calibration as Grid / Log View / Link (filename: 70, content-peek: 60).

---

## Switch in / out

- **Switch in via `switchFrom(oldEditor)`** — trait closure extracts host; id copied; storage rebound; `adoptHost` subscribes content + descriptorChanged forwarders; **and** `restore()` follow-up calls `loadData(host.state.get().content)` to populate the todo collection against the inherited content. Same shape as Grid GR7 / Log View LV4 / Link LK4.
- **Switch out** — trait closure unsubscribes forwarders, returns host. Editor disposes; queue drains; host transfers intact.
- **Switch widget visibility** — `findCompatibleEditors()` returns `["todo-view", "monaco"]` for a `.todo.json` file (content matches todo-editor + json is Monaco-compatible). Per PT10 the widget shows when length ≥ 2 AND current id is in the list — true for both directions.

---

## Lifecycle hooks

| Hook | TodoEditor |
|------|------------|
| `applyRestoreData` | ✅ — leftPanelWidth, selectedList, selectedTag |
| `switchFrom` | ✅ same shape as Grid / preview group / LogView / Link |
| `restore` | ✅ — host load + initial JSON parse via `loadData` |
| `saveState` | ✅ — flush onDataChanged + delegate `host.io.saveState()` |
| `beforeNavigateAway` | ❌ inherit (no sidebar-owning topology — TD6) |
| `onMainEditorChanged` | ❌ inherit (no sidebar-owning topology — TD6) |
| `confirmRelease` | ✅ — delegate host |
| `isFreshEmpty` | ❌ inherit (false) |
| `getNavigatorTarget` | ✅ — host's `{pipe, filePath}` |
| `hasTextSelection?` | ❌ inherit (undefined) |
| `findCompatibleEditors` | ✅ — `findEditorsAccepting(host)` |
| `getRestoreData` | ✅ — strip derived (listCounts/filteredItems/searchText/error/data) |
| `getIcon` / `noLanguage` | ❌ inherit |
| `focus` | ✅ — send `{ type: "focus" }` |
| `dispose` | ✅ — flush save + unsub + host dispose |

**Override count: 9** (down from Link's 11). The two-hook reduction is exactly the LK7 + LK8 retirement — `beforeNavigateAway` / `onMainEditorChanged` only matter for sidebar-owning editors, and Todo isn't one. This confirms the hooks are pay-only-when-used: a non-sidebar-owning editor doesn't even have to think about them.

---

## Persistence

### `getRestoreData()` output

```typescript
{
    editorId: "todo-view",
    id: "<uuid>",
    state: {
        title, modified,
        leftPanelWidth, selectedList, selectedTag,
    },
    host: {
        kind: "textFile",
        state: { id, content: "", language: "json", filePath, modified, encoding, encrypted, temp },
        pipe: { provider, transformers, encoding },
    },
}
```

Note: `content` lives in the host descriptor's state slice as the cache-keyed reference (P4); the actual JSON bytes stay in the per-editor cache file (`<editor.id>-host.txt`) per M9's invariant. The `data.state[id].contentHeight` map (today's per-item heights riding the JSON file) stays where they are — inside the todo JSON file itself, not in the descriptor. **Same split as Link LK3:** per-window UI state (which list is selected RIGHT NOW) goes to descriptor; per-item UI state (this item's measured height) stays in the file.

### Persisted slice size envelope (TD3)

Realistic distribution:
- Typical: `leftPanelWidth=200, selectedList="Inbox", selectedTag=""` — ~50 bytes JSON-serialized.
- Worst plausible: very long list name (`selectedList="Project: Q3 2026 quarterly review and roadmap planning"`) + long tag — ~180 bytes.

Three orders of magnitude under M9's 50KB per-page budget. Folding into descriptor matches Grid GR4 + Log View LV3 + Link LK3 — **fourth instance** of the cache-file → descriptor.state consolidation pattern.

### Migration from today's format

Per C2: no migration shim. Today's session data with `editor: "todo-view"` and `type: "textFile"` hits walkthrough 04 / P2's detect-and-skip path on first boot post-upgrade. The orphaned `<old-host.id>-todo-editor.txt` cache files (today's per-window selection state) get collected by per-editor `fs.deleteCacheFiles(editor.id)` on future dispose, or linger harmlessly per P9's no-sweep decision.

---

## Scripting

### `TodoEditorFacade` shape after refactor

```typescript
class TodoEditorFacade {
    constructor(private readonly editor: TodoEditor) {}

    // SF1 — item / list / tag operations preserved verbatim
    get items() { return this.editor.state.get().data.items.map(mapItem); }
    get lists() { return this.editor.state.get().data.lists; }
    get tags()  { return this.editor.state.get().data.tags.map(mapTag); }

    addItem(title: string): void { this.editor.addItem(title); }
    toggleItem(id: string): void { this.editor.toggleItem(id); }
    deleteItem(id: string): void { this.editor.deleteItem(id, true); }
    updateItemTitle(id: string, title: string): void { this.editor.updateItemTitle(id, title); }

    addList(name: string): boolean { return this.editor.addList(name); }
    renameList(oldName: string, newName: string): boolean { return this.editor.renameList(oldName, newName); }
    deleteList(name: string): void { this.editor.deleteList(name, true); }

    addTag(name: string): boolean { return this.editor.addTag(name); }

    selectList(name: string): void { this.editor.setSelectedList(name); }
    selectTag(name: string): void { this.editor.setSelectedTag(name); }
    setSearch(text: string): void { this.editor.setSearchText(text); }
    clearSearch(): void { this.editor.clearSearch(); }
}
```

`page.asTodo(force?: boolean)` — SF1's `force?: boolean` pattern. When `force=true`, calls `findCompatibleEditors()` to check Todo-view is compatible with the current host; if so, dispatches `page.switchMainEditor("todo-view")` and returns the facade. Else throws.

---

## Concerns

### TD1 — Class topology: direct `TodoEditor` (with TextFileModel host) or content-view on top of TextFileModel?

Today: `TextFileModel` IS the page's `mainEditor`; `TodoViewModel` is a `ContentViewModel<TodoEditorState>` acquired via `useContentViewModel("todo-view")` on the host.

Under EPIC-028 the ViewModel machinery retires (SF2 fully completed by walkthrough 23 / LV9). Three readings:

(a) **`TodoEditor` IS the page's mainEditor; HAS a `TextFileModel` content host.** Same shape as Monaco / Grid / Markdown / Mermaid / LogView / Link. CONTENT_HOST_TRAIT exposed. Switch-to-Monaco works (view raw `.todo.json` text). File / pipe / save-restore machinery delegated to host.

(b) **`TodoEditor` IS the page's mainEditor; owns the file directly (no IContentHost).** No CONTENT_HOST_TRAIT. File path, content, pipe owned directly by TodoEditor. Switch-to-Monaco impossible.

(c) **Hybrid — internal-only host without trait exposure.** No CONTENT_HOST_TRAIT; switch-to-Monaco impossible; raw-edit via "Open as text" menu only.

**RESOLVED 2026-05-20** — Option (a) confirmed. Same reasoning as LV1 / LK1 (uniformity with Tier 5; switch-to-Monaco meaningful for `.todo.json` since users may need to hand-edit a corrupted entry; host machinery reuse). **Seventh Tier 5 editor** in the uniform "EditorModel IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT exposed" shape. Rejected (b) own-the-file-directly — duplicates host machinery; breaks switch-to-Monaco. Rejected (c) internal-only — adds opaque branch for no benefit; CONTENT_HOST_TRAIT is the natural exposure point. No mockup change required.

### TD2 — State slice partitioning: which fields persist, which ride state for reactivity, which become private?

Today's `TodoEditorState` has 8 fields; the model has 4 private fields plus one static `cacheName`. Under EPIC-028 each lands in one of three layers:

(a) **Three layers as documented in the class sketch:**
- **Persist via `getRestoreData`**: `leftPanelWidth`, `selectedList`, `selectedTag` (3 fields — today's selection-state cache file content [`selectedList`/`selectedTag`] plus `leftPanelWidth` which today rides state without per-window persistence — folding into descriptor adds it as a side bonus, same incidental fix as Link LK2).
- **Ride state for reactivity, strip from descriptor** (MO5 / GR8 / LV2 / LK2 pattern): `data`, `error`, `listCounts`, `filteredItems` (4 fields — `data` derived from `host.content` via `loadData`; `listCounts` derived from `data.items` via `loadListCounts`; `filteredItems` derived from `data + selectedList + selectedTag + searchText` via `applyFilters`).
- **Transient UI state, not persisted**: `searchText` (1 field — same as Link's `searchText` per LK2).
- **Stay private (non-state)**: `_skipNextContentUpdate`, `_lastSerializedData`, `_lastFilterState`, `_gridModel` (4 fields — bookkeeping + view ref). `selectionRestored` retires per TD3 (no separate cache file to one-shot-guard against).

(b) **Persist `searchText` too** for cross-restart continuity (user reopens a `.todo.json` file and finds their last search intact).

(c) **Persist nothing at all** — drop selection-state cache entirely; force fresh "All lists, no tag, default width" on every page open. Same form as PV6's (c) option.

**RESOLVED 2026-05-20** — Option (a) confirmed. The three persisted fields match today's selection-state cache exactly (`selectedList` / `selectedTag` 1:1 mapping to what's in `<host.id>:todo-editor` today); plus `leftPanelWidth` which today is forgotten on restart (silent today-bug — **incidentally fixed by the consolidation**, same incidental fix as Link LK2 / `leftPanelWidth`). Rejected (b) persist searchText — transient UI state; reopening a file and finding a stale search is a worse UX than reopening with a clean slate. Rejected (c) persist nothing — regresses today's good behavior (users notice when their last selected list is forgotten). No mockup change required.

### TD3 — Selection-state cache retirement: fold into descriptor or keep separate cache file?

Today: `<host.id>:todo-editor` cache file via `host.stateStorage.setState(host.id, "todo-editor", JSON.stringify({selectedList, selectedTag}))`. Debounced 300ms. Read once on first `loadData` via `selectionRestored` one-shot guard.

Under EPIC-028 with EditorDescriptor.state riding the per-window descriptor save:

(a) **Fold into `EditorDescriptor.state` per TD2 (a).** Mirrors Grid GR4 + Log View LV3 + Link LK3 decisions. Eliminates the dedicated cache file. Single source of truth: editor state → descriptor; host content → cache file. Window-level 500ms debounce per P3 replaces today's 300ms.

(b) **Keep separate cache file `<editor.id>-todo-editor.json`**. Preserves today's pattern. Editor-private; lower descriptor footprint (~60 bytes saved per page).

(c) **Hybrid: persist `selectedList` only via descriptor; keep `selectedTag` in cache file**. Splits the cache file content; over-engineered.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons identical to GR4 / LV3 / LK3:
1. **Mirrors Grid GR4 + Log View LV3 + Link LK3** — **fourth instance** of the pattern; consistency across Tier 5 editors with per-window UI state.
2. **Unifies persistence** — one less per-editor cache file to track; one less restore-time async-await path (today's `restoreSelectionState` + `selectionRestored` one-shot guard both retire; `static cacheName = "todo-editor"` retires too).
3. **IPC drag transfer naturally atomic** — descriptor carries everything; no separate-cache-file race during cross-window drag.

Rejected (b) — duplicates the today-pattern that GR4 + LV3 + LK3 eliminated for the same reasons. Rejected (c) — premature splitting. **Fourth instance of "per-editor cache file → descriptor.state" pattern (Grid GR4 → Log View LV3 → Link LK3 → Todo TD3).** Pattern is now firmly standardized across half of Tier 5. No mockup change required.

**Amended 2026-05-21 by HS1.** Folds into `host.editorSettings["todo-view"]`, not `EditorDescriptor.state`. `leftPanelWidth` + `selectedList` + `selectedTag` ride the host slot — survive Todo↔Monaco switches (user toggles to raw JSON to verify item shape, switches back; selected list stays put) AND app restarts. Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### TD4 — JSON parse/serialize lifecycle hooks under EPIC-028

Today's `TodoViewModel` lifecycle:
- `onInit` — state subscription → debounced save; initial `loadData(host.content)` (which also kicks off async `restoreSelectionState`)
- `onContentChanged(content)` — guards on `skipNextContentUpdate`; else `loadData(content)`
- `onDispose` — flushes pending save via `this.onDataChanged()`

Under EPIC-028 / SF2:

(a) **Three-site split (mirrors LV4 / LK4):**
- `restore()` — sets up state subscription → `onDataChangedDebounced`; calls `loadData(host.content)` initial parse; `selectionRestored` flag retires per TD3 (selection state arrives via `applyRestoreData` from descriptor, not from a separate cache file).
- `adoptHost` content subscription — calls `loadData(content)` with `skipNextContentUpdate` guard.
- `dispose()` — flushes pending save; unsubs forwarders; nulls refs; host dispose.

(b) **Single editor-level `loadData` for both initial and incremental** — drop the redundant subscription-during-restore pattern; tie initial load to first `adoptHost`. Slightly fewer lines; equivalent observable behavior.

(c) **Defer parse until first read** — lazy parse on first view subscribe. Adds complexity.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three sites as described. Mechanical fall-out from SF2 + TD3. Mirrors Log View LV4 / Link LK4's three-site shape — third Tier 5 editor in this lifecycle pattern. The state→save subscription happens once in `restore()` (not in `adoptHost`, which fires on switch-in too — we don't want to re-subscribe). Rejected (b) tie initial-load to adoptHost — couples concerns (host adoption vs. initial parse + state subscription setup); fragile when switchFrom adopts an already-parsed host. Rejected (c) lazy parse — adds complexity. No mockup change required.

### TD5 — `skipNextContentUpdate` flag under host subscription (mirrors LV6 / LK5)

Today's mechanism: identical to Log View LV6 and Link LK5 — editor's mutators set `skipNextContentUpdate = true`, then call `host.changeContent(newContent, true)`. Host's content subscription fires; the editor reads + resets the flag and skips re-parsing.

Under EPIC-028, three candidates (same as LV6 / LK5):

(a) **Keep `skipNextContentUpdate` flag** — verbatim port.
(b) **Pass `bySelf` parameter to `host.changeContent(content, bySelf)`** — leaks editor concern into host API.
(c) **TOneState change-reason tracking on host** — over-engineered for three consumers (LogView + Link + Todo).

**RESOLVED 2026-05-20** — Option (a) confirmed. Same reasoning as LV6 / LK5 — flag is editor-private; race is editor-internal; today's pattern works. **Third instance of the self-write-guard pattern** in EPIC-028 (LV6 → LK5 → TD5). The pattern is now firmly standardized: any append-or-mutate-then-serialize editor that writes back to its host via `host.changeContent` carries this flag. Rejected (b) host-side `bySelf` parameter — leaks editor concern into host API; the consumer count keeps growing but the trade-off doesn't shift. Rejected (c) change-reason tracking — over-engineered for 3 consumers. No mockup change required.

### TD6 — Sidebar / panel topology: confirm Todo is NOT sidebar-owning

Walkthrough 24's closure prediction was: "Walkthrough 25 (Todo) is next — second sidebar-owning editor in Tier 5; follows the LK7 + LK8 + LK9 template laid down here…". A first-principles reading of `register-editors.ts:388-422` and `secondary-editor-registry.ts` contradicts this:

- `register-editors.ts` lines 388-422 register `todo-view` as `category: "content-view"` with no `secondaryEditor` field anywhere.
- `secondary-editor-registry.ts` (grep across) returns zero matches for `todo`.
- `TodoListPanel` lives inside `TodoEditor.tsx`'s render tree — directly composed into the editor body via `<TodoListPanel pageModel={vm} … />`, sized by `Splitter`, never registered as a sidebar panel.

So under EPIC-028:

(a) **TodoEditor stays a single-surface editor — no sidebar registration.** `TodoListPanel` becomes a child component of `TodoBody` exactly as today. No `setSidebarPanels` method, no `beforeNavigateAway` override, no `onMainEditorChanged` override. `model.secondaryEditor` stays empty / unset. **The LK7 / LK8 / LK9 recipe explicitly does NOT apply.**

(b) **Promote `TodoListPanel` to a sidebar editor** — register it as `secondaryEditorRegistry.register({ id: "todo-list", … })`. Requires the LK7 + LK8 + LK9 recipe. Adds sidebar-shown / in-editor-shown mode multiplexing similar to Link's three render modes.

(c) **Conditional sidebar registration based on user preference** — let users opt in. Adds a settings flag. Same complexity as (b) plus a settings field.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **Matches today's behavior exactly.** Today TodoListPanel renders inline always; no user-facing UI hints at a sidebar promotion. Changing this is a UX decision that doesn't belong inside an architectural refactor.
2. **Lighter override count.** Todo's override list (9 hooks) is the canonical "no panels needed" Tier 5 shape — the contrast with Link (11 hooks) makes it concrete that `beforeNavigateAway` + `onMainEditorChanged` are pay-only-when-used hooks.
3. **Walkthrough 24's prediction correction is a calibration finding, not an error.** The Tier 5 sidebar-owning recipe (LK6+LK7+LK8+LK9) stays at one example (Link) — the next opportunity to validate the recipe carries cleanly across editors is the no-host group (walkthrough 30 — Archive's existing override + Explorer's CategoryEditor + LinkEditor's already-resolved overrides) and possibly Rest Client (walkthrough 26 — depending on whether Rest Client's collection sidebar is sidebar-registered or inline; pre-check needed).

Rejected (b) — extends scope without UX justification. Rejected (c) — premature scaffolding. The walkthrough 24 closure pointer to walkthrough 25 as "second sidebar-owning editor" was a self-correction opportunity — flagged here, no other walkthroughs touched.

### TD7 — Per-item content height persistence: stays in JSON `data.state` or moves to descriptor?

Today: each item's measured `contentHeight` is stored in `data.state[itemId].contentHeight` — INSIDE the JSON file. Used by `RenderFlexGrid`'s `getInitialRowHeight` callback for first-render sizing without measurement lag. Persisted across windows by virtue of being inside the file.

Two readings under EPIC-028:

(a) **Stay in JSON file, exactly as today.** `data.state` is logical per-item state (the item's measured height), not per-window state. Survives cross-window transfer with the file. Equivalent to Link's `data.state.{categoryViewMode, tagViewMode, hostnameViewMode, pinnedLinks, pinnedPanelWidth}` — per-collection state, not per-window.

(b) **Move heights to descriptor**, alongside `leftPanelWidth` / `selectedList` / `selectedTag`. Per-window state. Different window's first render measures fresh.

(c) **Move heights to per-editor cache file** (`<editor.id>-todo-heights.json`). Survives windows but isolated from the JSON file's content.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **Right scope.** Item height is a function of the item's content (longer comment → taller row). It's an item property, not a window property. When two windows view the same `.todo.json`, they want the same measured heights — measuring fresh in each window wastes the first render and produces a brief layout pop.
2. **Mirrors Link's per-collection state pattern.** Link folds `categoryViewMode` / `tagViewMode` / `hostnameViewMode` / `pinnedLinks` into `data.state` (per-collection); per-window UI state (which category is selected RIGHT NOW) goes to descriptor. Todo does the same split.
3. **Today's pattern works.** No bug pressure; the silent "height saved only when piggybacking on another save" is acceptable noise — heights are rough hints to RenderFlexGrid, not load-bearing precision.

Rejected (b) — same-file-two-windows would lose the cache benefit. Rejected (c) — extra cache file with no advantage over staying in the JSON. No mockup change required. **Same precedent as Link LK2's `data.state` per-collection split.**

### TD8 — Confirmation dialogs from model mutators (`ui.confirm` / `ui.notify`)

Today's `deleteItem`, `deleteList`, `deleteTag` call `ui.confirm(...)` directly from the model layer (with `skipConfirm` opt-out for script API). `moveItem` calls `ui.notify(..., "warning")` when a filter is active. Same pattern Log View has (LogView dialog entries) — model imperatively calls `ui` for confirmation / notifications.

Under EPIC-028 the question is "does this pattern survive the host/editor split?":

(a) **Preserved verbatim.** `ui.confirm` / `ui.notify` are app-level singletons accessible from anywhere; the EditorModel layer can call them directly. The host/editor split doesn't touch this surface.

(b) **Pipe confirmations through a model→view ComponentQueue event** so the view owns the dialog rendering. Adds an async round-trip; view code grows.

(c) **Move confirmations into the view** — model's `deleteItem` becomes "no confirmation," and the view's IconButton onClick wraps the call with `ui.confirm`. Splits the implementation between two layers.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **`ui` is app-level by design.** The `app.ui` namespace is accessible from anywhere (renderer-process singleton); model code already calls it elsewhere (Log View's confirm-on-script-cancel; archive's overwrite-file). EPIC-028's host/editor split is about ownership of FILE / EDITOR state, not about UI primitive access.
2. **Script API symmetry.** Today's `deleteItem(id, skipConfirm = false)` lets `TodoEditorFacade.deleteItem(id)` pass `true` to bypass dialogs. Moving the confirmation to the view splits this — scripts would need a separate "delete without confirm" path. Today's signature is the right shape.
3. **No leak.** `ui.confirm` doesn't pull view-layer concepts into the model — it's an opaque "ask the user" primitive. The model decides WHEN to ask; the framework decides HOW to ask.

Rejected (b) — ComponentQueue is for mailbox-style asynchronous notification with at-most-one consumer; confirmation dialogs are RPC-style with the framework as consumer. Different shape. Rejected (c) — splits the implementation and breaks script API symmetry. No mockup change required.

### TD9 — Drag-and-drop reordering via `TraitTypeId.TodoItem`

Today: `TodoItemView` uses `setTraitDragData(e.dataTransfer, TraitTypeId.TodoItem, { id: item.id })` to encode drag payload; `vm.moveItem(fromId, toId)` handles the reorder. Reordering is restricted to undone items, single-list view, no-tag-filter (model warns via `ui.notify` otherwise).

Under EPIC-028 the question is "does the trait system carry verbatim?":

(a) **Preserved verbatim.** `TraitTypeId.TodoItem` stays in `TraitRegistry.ts`; the drag data format is independent of the EditorModel topology; `vm.moveItem` is method-equivalent to `editor.moveItem` post-refactor.

(b) **Promote to a trait on the EditorModel itself** (e.g., `REORDERABLE_LIST_TRAIT`) so other editors can opt in. Adds infrastructure for one consumer.

(c) **Inline drag handling in `TodoBody`** — drop the `setTraitDragData` abstraction. Loses cross-editor drop targeting.

**RESOLVED 2026-05-20** — Option (a) confirmed. Two reasons:
1. **`TraitTypeId` is the trait SYSTEM's job, not EditorModel traits.** `TraitTypeId.TodoItem` lives in the drag-and-drop trait system (`src/renderer/core/traits/`), which is orthogonal to `EditorModel.traits` (which carries `CONTENT_HOST_TRAIT` and editor-level capability traits). The two trait systems are deliberately separate — drag traits describe DATA shapes that can be dragged; editor traits describe CAPABILITY shapes editors expose.
2. **Single consumer.** No other editor today consumes `TraitTypeId.TodoItem`; future cross-editor "drag a todo onto a markdown file" handlers are speculative. The today-pattern works; refactoring it adds nothing.

Rejected (b) — different trait system; conflating them adds confusion. Rejected (c) — loses the typed payload abstraction; cross-editor drop targeting is the trait system's reason for existing. No mockup change required.

### TD10 — Registry surface: `accepts()` predicate + queue event union

Today four predicates: `acceptFile` (filename), `validForLanguage` (language), `switchOption` (language + filename), `isEditorContent` (language + content match). Under EPIC-028 the registry mockup collapses all to a single `accepts({host, fileName, language, mode}): number`.

Candidate shapes (mirrors LV10 / LK10):

(a) **Filename-strong, content-peek fallback** (priorities 70 / 60):
```typescript
accepts({host, fileName, language}): number {
    if (fileName && /\.todo\.json$/i.test(fileName)) return 70;
    if (language === "json" && host) {
        const content = host.state.get().content;
        if (content.includes('"type"') && /"type"\s*:\s*"todo-editor"/.test(content) && content.includes('"items"'))
            return 60;
    }
    return -1;
}
```
Queue events: `{ type: "focus" }` only; queue request: `never`. Same minimal shape as Grid GR10 / Log View LV8 / Link LK10.

(b) **Filename-only** — drop content-peek. `.json` files without `.todo.json` extension can't be detected as todo collections.

(c) **Add `scrollToItem` queue event** — proactively for future `page.asTodo().scrollToItem(id)` script API. No current consumer.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **Mirrors LV10 / LK10 calibration** — filename 70 + content-peek 60 across Tier 5 maintains a coherent priority space. JSON files generated by scripts that happen to contain `"type":"todo-editor"` get the switch-widget option to view as Todo.
2. **Minimal queue matches today's UI affordances** — no script API today wants to scroll-to-item; no per-entry highlight; no progress-style UI. YAGNI on (c).
3. **Symmetric with Tier 5 siblings** — Markdown / Svg / Html / Mermaid / LogView / Link all minimal-queue; Todo follows the pattern.

Rejected (b) — drops switch-widget visibility for content-matching JSON. Rejected (c) — premature scaffolding (PV7 / PV8 / LV8 / LK10 same rejection). No mockup change required.

---

## Mockup adjustments

**Zero mockup changes landed.** All ten concerns resolve at the real-code layer.

The walkthrough 20 / 21 / 22 / 23 / 24 template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) carries TodoEditor end-to-end. Tier 5 template stability holds across the **first non-sidebar-owning Tier 5 editor since walkthrough 23 (Log View)** — confirms the template covers both sidebar-owning and non-sidebar-owning shapes uniformly; the only difference is the override count (Todo: 9 hooks; Link: 11 hooks). The eight-piece template slots cleanly.

---

## Migration scope

Real-code only (carried to implementation):

- **New files** (two):
  - `src/renderer/editors/todo/TodoEditor.ts` — `TodoEditor` class + `TodoEditorState` + `TodoQueueEvent`.
  - `src/renderer/editors/todo/TodoEditorView.tsx` — view shell: `<TextChrome>` + `<TodoBody>` + `<TodoToolbarBits>` + `<TodoFooterBits>`.

- **Renamed / refactored files**:
  - `TodoViewModel.ts` deletes — state shape + setters + private fields + JSON parse/serialize + item / list / tag CRUD all absorb into `TodoEditor.ts`. `createTodoViewModel` factory removed.
  - Today's `TodoEditor.tsx` renames to `TodoBody.tsx` — drops `useContentViewModel`, drops `useSyncExternalStore` (replaced by `model.state.use()`), drops the portal-based toolbar+footer (relocated to `TodoToolbarBits` + `TodoFooterBits` inside `TodoEditorView.tsx` per walkthrough 09 / 10).
  - `components/TodoListPanel.tsx` — `pageModel: TodoViewModel` prop renames to `model: TodoEditor`; method calls preserved verbatim (`pageModel.setSelectedList(...)` → `model.setSelectedList(...)`).
  - `components/TodoItemView.tsx` — `pageModel: TodoViewModel` prop renames to `model: TodoEditor`; method calls preserved.

- **Deleted files**:
  - `TodoViewModel.ts` (the file).

- **Edited files**:
  - `src/renderer/editors/register-editors.ts` — todo-view registration swaps from VM-based to EditorModel-based: `() => new TodoEditor(state)`. Drops `acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent` quartet in favor of single `accepts()` per TD10.
  - `src/renderer/editors/registry.ts` — `TodoEditor.accepts` predicate landed per TD10 sketch.
  - `src/renderer/scripting/api-wrapper/TodoEditorFacade.ts` — constructor accepts `TodoEditor` (was `TodoViewModel`); method bodies preserved (`this.vm.X` → `this.editor.X`). `page.asTodo(force?)` adds the SF1 force parameter.
  - `src/renderer/api/pages/PageModel.ts` — no change.
  - `src/renderer/api/types/todo-editor.d.ts` — declaration file already exists; updated to reflect `page.asTodo(force?): TodoEditorFacade`.

- **Persistence migration**: zero per C2 + P2. Today's `<host.id>-todo-editor.txt` cache files (per-window selection state) get collected by per-editor `fs.deleteCacheFiles(editor.id)` on future dispose; orphans linger harmlessly per P9.

- **Touch on shared components**: none. `RenderFlexGrid`, `Splitter`, `Panel`, `Input`, `Textarea`, `IconButton`, `WithMenu`, `Dot`, trait DnD utilities all carry over verbatim.

---

## Closure

All ten concerns RESOLVED 2026-05-20. **Zero mockup changes.**

Final outcomes by concern:

| # | Resolution | Mockup change |
|---|------------|---------------|
| TD1 | (a) — `TodoEditor` IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT (seventh Tier 5 editor in uniform shape) | none |
| TD2 | (a) — 3 persisted (`leftPanelWidth` + `selectedList` + `selectedTag`) / 4 ride-state stripped / 1 transient / 4 private | none |
| TD3 | (a) — fold selection-state cache into `EditorDescriptor.state` (fourth instance: Grid GR4 → Log View LV3 → Link LK3 → Todo TD3) | none |
| TD4 | (a) — three-site lifecycle split: `restore()` initial parse + `adoptHost` content subscription + `dispose()` flush | none |
| TD5 | (a) — keep `skipNextContentUpdate` editor-private flag (third instance: Log View LV6 → Link LK5 → Todo TD5) | none |
| TD6 | (a) — Todo is NOT sidebar-owning; LK7 / LK8 / LK9 recipe explicitly does NOT apply; corrects walkthrough 24's closure prediction | none |
| TD7 | (a) — item heights stay in `data.state[id].contentHeight` (JSON file, per-item, mirrors Link's `data.state` per-collection split) | none |
| TD8 | (a) — preserved `ui.confirm` / `ui.notify` direct calls from model mutators (script API uses `skipConfirm=true`) | none |
| TD9 | (a) — `TraitTypeId.TodoItem` drag system preserved verbatim (orthogonal to EditorModel traits) | none |
| TD10 | (a) — filename `.todo.json` priority 70 + content-peek priority 60; queue events `{ focus }` only; request `never` | none |

**Tier 5 template confirmed on the seventh Tier 5 editor — the first non-sidebar-owning editor since walkthrough 23.** Walkthroughs 20 / 21 / 22 / 23 / 24 set the template on Monaco (complex) → Grid (medium) → Preview group (light) → LogView (append-only) → Link (sidebar-owning); this walkthrough confirms it carries cleanly on a **non-sidebar-owning content-view editor with in-editor side panel** — proving the template covers both sidebar topologies with a uniform shell and pay-only-when-used lifecycle hooks.

**Cross-walkthrough cleanups landed by this walkthrough:**

- **TD3** — **fourth instance** of "per-editor cache file → descriptor.state" consolidation (Grid GR4 → Log View LV3 → Link LK3 → Todo TD3). Pattern is now standardized across half of Tier 5; the next text-bearing editors (Rest Client, etc.) should default to this pattern without re-litigation.
- **TD5** — **third instance** of "self-write guard" pattern (Log View LV6 → Link LK5 → Todo TD5). Pattern is now standardized across all mutate-then-serialize editors.
- **TD6** — **calibration finding.** Walkthrough 24's closure pointer to walkthrough 25 as "second sidebar-owning editor" was incorrect. Todo is not sidebar-owning. The LK7 / LK8 / LK9 recipe (the `beforeNavigateAway` + `onMainEditorChanged` + TreeProvider integration pattern) stays at one example (Link) until a true second sidebar-owner lands — most likely in walkthrough 30 (Archive + Explorer in the no-host group) or walkthrough 26 (Rest Client — pending pre-check of its collection sidebar topology).
- **TD2 / TD3** — `leftPanelWidth` silent today-bug incidentally fixed by the descriptor consolidation (second instance of this incidental fix after Link LK2; pattern: any field that lived on VM-state-but-never-persisted gets a free persistence upgrade when descriptor folding runs).

**Implementation notes carried forward:**

- The Tier 5 class repetition count grows to **seven editors** with the same ~80-LOC skeleton (Monaco / Grid / Markdown / Mermaid / LogView / Link / Todo all carry an identical CONTENT_HOST_TRAIT closure + adoptHost + switchFrom + restore + dispose shape). PV1's "re-evaluate after walkthroughs 23–29" recommendation continues to apply — yet one more data point in the "common surface might be extractable" direction, but the actual call still belongs after all text-bearing editors land.
- TodoEditor's class name finalizes as `TodoEditor` (matching the rest of the Tier 5 naming convention: MonacoEditor, GridEditor, MarkdownEditor, LogViewEditor, LinkEditor). Today's `TodoEditor.tsx` React component file renames to `TodoBody.tsx` per the Tier 5 template (consistent with `MarkdownBody.tsx`, `GridBody.tsx`, `LogBody.tsx`, `LinkBody.tsx`).
- Today's `selectionRestored` one-shot flag retires entirely — `applyRestoreData` populates `selectedList` / `selectedTag` before `restore()` calls `loadData`, so there's no "first parse loaded the JSON; now async-load the cache file" race to guard. Cleaner lifecycle. **Second instance of this retirement** (after Link LK3's `selectionRestored`); confirms the pattern is general — any "one-shot async cache restore" guard retires when its cache file folds into descriptor.
- Override count: 9 hooks (vs. Link's 11). The two-hook delta is exactly `beforeNavigateAway` + `onMainEditorChanged`. Documents the "pay-only-when-used" property of those hooks concretely — a Tier 5 editor that doesn't own a sidebar doesn't even mention them in its class.
- **Drag-and-drop trait orthogonality clarified by TD9.** The two trait systems (drag traits via `TraitTypeId.X` / EditorModel traits via `model.traits.set(KEY, impl)`) coexist without conflict; today's separation is deliberate; future editors with reorderable lists (Notebook, possibly Graph) will follow the same pattern — drag trait for the data shape, editor trait for capability exposure.

**Walkthrough 26 (Rest Client) is next** — before drafting, pre-check whether Rest Client registers its collection panel as a secondary editor (which would make it a second sidebar-owner and validate the LK7+LK8+LK9 recipe) or renders it inline (which would make it the eighth Tier 5 editor in the same shape as Todo).
