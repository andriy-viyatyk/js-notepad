# Link walkthrough

> **Status:** Done 2026-05-20. Tier 5 per-editor walkthrough — Link editor (`.link.json` collections). All ten concerns (LK1–LK10) RESOLVED. **Zero mockup changes** — fourth template-confirmation walkthrough in a row (after Grid, Preview group, Log View). **First sidebar-owning editor in Tier 5** — first text-bearing-editor exercise of `beforeNavigateAway` + `onMainEditorChanged` lifecycle hooks deferred from walkthrough 03; retires today's "demote survives as secondary" view-side `useEffect` cleanup-function hack; replaces today's three duck-typed `(m as any).treeProvider = …` writes with typed accessors on the LinkEditor class.

Walkthrough 24 finalizes `LinkEditor` — the Link collection editor under EPIC-028. Link is unique in the Tier 5 set so far: it is the **first sidebar-owning editor** in Tier 5 (it registers three secondary panels — Categories / Tags / Hostnames — when shown as a main editor, AND its Categories+Tags panels independently surface in the sidebar even when LinkEditor is NOT the main editor of the page). It also exposes the "**demote survives as secondary**" behavior that today is implemented via a fragile view-side cleanup-function early-return inside a `useEffect` — the kind of view-touches-page-internals shape EPIC-028 exists to retire.

---

## State today

`src/renderer/editors/link-editor/` is a self-contained folder of 19 files:

| File group | Contents |
|------------|----------|
| Core | `LinkViewModel.ts`, `LinkEditor.tsx`, `linkTypes.ts`, `LinkTreeProvider.ts`, `linkTraits.ts` |
| Center surfaces | `LinksList.tsx`, `LinksTiles.tsx`, `LinkItemList.tsx`, `LinkItemTiles.tsx`, `PinnedLinksPanel.tsx`, `EditLinkDialog.tsx`, `LinkTooltip.tsx` |
| Sidebar panels (in-editor) | `panels/LinkCategoryPanel.tsx`, `panels/LinkTagsPanel.tsx`, `panels/LinkHostnamesPanel.tsx` |
| Sidebar panels (secondary wrappers) | `panels/LinkCategorySecondaryEditor.tsx`, `panels/LinkTagsSecondaryEditor.tsx`, `panels/LinkHostnamesSecondaryEditor.tsx` |

### Today's ViewModel state shape

```typescript
const defaultLinkEditorState = {
    data: { links: [], state: {} } as LinkEditorData,    // root file shape
    error: undefined as string | undefined,
    leftPanelWidth: 200,
    expandedPanel: "categories" as ExpandedPanel,        // "tags" | "categories" | "hostnames"
    // Derived from data.links (recomputed on data change):
    categories: [] as string[],
    categoriesSize: {} as { [key: string]: number },
    tags: [] as string[],
    tagsSize: {} as { [key: string]: number },
    hostnames: [] as string[],
    hostnamesSize: {} as { [key: string]: number },
    // Filtering (drives the center grid):
    selectedCategory: "" as string,
    selectedTag: "" as string,
    selectedHostname: "" as string,
    searchText: "" as string,
    filteredLinks: [] as LinkItem[],
    // Selection:
    selectedLinkId: "" as string,
};
```

### Today's private fields

| Field | Purpose |
|-------|---------|
| `lastSerializedData: LinkEditorData \| null` | Reference-equality marker — skips serialization when `state.data` hasn't been swapped |
| `skipNextContentUpdate: boolean` | Self-write guard — set when the VM serializes its own state to JSON so `onContentChanged` doesn't re-parse what we just wrote (same shape as Log View) |
| `selectionRestored: boolean` | One-shot flag — restores `<host.id>-link-editor` cache file (expandedPanel / selectedCategory / selectedTag / selectedHostname) on first `loadData` |
| `lastFilterState` | Incremental-search optimization — caches `{ searchText, selectedCategory, selectedTag, selectedHostname, expandedPanel }` so search-extension can filter the previous result without rescanning all links |
| `_treeProvider: LinkTreeProvider \| null` | Lazy LinkTreeProvider; created on first access for sidebar-secondary mode (TreeProviderView in `LinkCategoryPanel`) |
| `gridModel: RenderGridModel \| null` | Center grid model ref — set via `setGridModel` callback; used to force re-render on filter changes |
| `containerElement: HTMLElement \| null` | Outer Panel ref — set via React ref; used to refocus after dialog dismissals |

Plus two **optional callback fields** that callers attach by direct assignment (duck-typing):

| Field | Purpose |
|-------|---------|
| `onLinkOpen?: (data: ILinkData) => void` | Set by `BrowserEditorModel` so links opened from the Browser's sidebar Link panel set `target/browserPageId` to navigate within the browser page instead of opening a new tab |
| `onGetLinkMenuItems?: (link: LinkItem) => MenuItem[]` | Set by Browser to add "Open in New Tab" to the link context menu |

### Today's lifecycle entry points

- `onInit()` — subscribes `state` → debounced `onDataChangedDebounced` (300ms); reads `host.state.content`; calls `loadData(content)` (which also kicks off `restoreSelectionState`).
- `onContentChanged(content)` — guards on `skipNextContentUpdate` flag; otherwise re-parses via `loadData(content)`.
- `onDispose()` — flushes pending debounced save (`this.onDataChanged()`); clears `containerElement`; nulls `_treeProvider`.

### Today's JSON self-write pattern

Same shape as Log View (LV6) — bidirectional dance between editor state and host content:

1. User mutates state (`addLink`, `setSelectedCategory`, `setViewMode`, …) → `state.update(…)` fires subscribers.
2. Debounced `onDataChangedDebounced` (300ms) calls `onDataChanged`:
   - Reads `state.data`; if `data === lastSerializedData` returns (no-op).
   - Sets `skipNextContentUpdate = true`.
   - Serializes JSON: `{ type: "link-editor", links: [...], state: {...} }`.
   - Calls `host.changeContent(content, true)` — `true` = "set modified flag".
3. Host content subscription fires `onContentChanged(content)`:
   - Sees `skipNextContentUpdate === true` → resets to false, returns without re-parsing.

External changes (user edits the JSON in another editor, file reload, etc.) hit `onContentChanged` without the flag set → `loadData` re-parses.

### Today's selection-state cache

Today's `<host.id>:link-editor` cache file (via `host.stateStorage.setState(host.id, "link-editor", JSON.stringify(...))`) stores four fields:
```typescript
{ expandedPanel, selectedCategory, selectedTag, selectedHostname }
```
- **Read** in `restoreSelectionState` (called once during the first `loadData` via `selectionRestored` one-shot guard).
- **Written** in `saveSelectionState` (debounced 300ms, fired by `setExpandedPanel` / `setSelectedCategory` / `setSelectedTag` / `setSelectedHostname`).

Two parallel persistence channels: the JSON file (link data + per-category view modes + pinned links) and the cache file (per-window UI selection state). Same shape Grid had pre-GR4 and Log View had pre-LV3.

### Today's view-side machinery (`LinkEditor.tsx`)

- `useContentViewModel<LinkViewModel>(model, "link-view")` — ref-counted acquire/release (SF2 target; retires alongside Log View's last consumer per LV9).
- `useSyncExternalStore` over `vm.state` for reactive read.
- `useState`+ event subs to `pageNavigatorToggled` + `panelExpanded` global events — tracks `isNavigatorOpen` (when true, the sidebar is shown so panels move out of LinkEditor.tsx into the secondary-editor surfaces).
- **Secondary-editor registration `useEffect`** (LinkEditor.tsx:123-153) — the "fragile" block:
  ```typescript
  useEffect(() => {
      if (!vm) return;
      if (!showPanelsInSidebar) {
          if (model.secondaryEditor?.length) model.secondaryEditor = undefined;
          return;
      }
      model.secondaryEditor = LINK_PANELS;   // ["link-category", "link-tags", "link-hostnames"]
      // Expand the sidebar panel matching vm.expandedPanel
      const reverseMap = { categories: "link-category", tags: "link-tags", hostnames: "link-hostnames" };
      const panelToExpand = reverseMap[pageState.expandedPanel] ?? "link-category";
      model.page?.expandPanel(panelToExpand);
      return () => {
          // Don't clear panels if this model was demoted to secondary-only
          // (still in secondaryEditors[] but no longer mainEditor)
          const page = model.page;
          if (page && page.mainEditor !== model && page.secondaryEditors.includes(model)) {
              return;
          }
          model.secondaryEditor = undefined;
      };
  }, [vm, showPanelsInSidebar]);
  ```
  The cleanup early-return is the "demote survives as secondary" workaround — when LinkEditor used to be the mainEditor and the user navigates to a different file in the same page, today's `PageModel.setMainEditor` keeps LinkEditor alive in `secondaryEditors[]` (Pattern B); the view-side cleanup must not destroy panels in that case.
- Center panel drop zone (handles LINK trait drops via `vm.importLinks`); view-mode menu; portal-based toolbar + footer contributions (relocate per walkthrough 09 / 10).

### Today's three secondary-panel components

Each secondary panel has its own React component file that wraps the in-editor panel for the sidebar:

- **`LinkCategorySecondaryEditor.tsx`** — most complex:
  - Subscribes to `model.page?.state` to get `mainEditorId`; computes `isMainEditor = mainEditorId === model.id`.
  - Exposes `treeProvider` / `selectionState` / `selectByHref` on the model via duck-typing (`m.treeProvider = vm.treeProvider`, etc.) for sibling-panel reads (CategoryEditor's `findTreeProviderHost`).
  - Dynamically updates `model.secondaryEditor` in **standalone-secondary mode** (when LinkEditor is NOT mainEditor) based on whether tags exist: `["link-category"]` or `["link-category", "link-tags"]`.
  - Renders `<LinkCategoryPanel vm useOpenRawLink={!isMainEditor} categoriesOnly={isMainEditor} />` — different mode for main vs. secondary use.
  - Header: "Categories" (main mode) or "Links" (secondary mode), with optional Save button (when modified) + Swap button calling `model.page?.promoteSecondaryToMain(model)`.
- **`LinkTagsSecondaryEditor.tsx`** — has TWO render modes:
  - Main mode (`isMainEditor`): just renders `<LinkTagsPanel vm />`.
  - Secondary mode: renders `LinkTagsNavigationPanel` — `<LinkTagsPanel vm />` on top + resizable links list on bottom for navigating into tag content.
- **`LinkHostnamesSecondaryEditor.tsx`** — thinnest:
  - Just renders `<LinkHostnamesPanel vm />`.
  - Never registered in standalone-secondary mode (Categories panel's `updatePanels` excludes it).

### Today's "three render modes" for LinkCategoryPanel

| Mode | Owner | Trigger | Panel props |
|------|-------|---------|-------------|
| **Main-editor mode** | `LinkEditor.tsx` renders panels INSIDE the editor when sidebar is closed | `!showPanelsInSidebar` | `<LinkCategoryPanel vm useOpenRawLink={false} categoriesOnly={false} />` — clicks filter content; categories + leaf links shown |
| **Sidebar-while-main** | LinkEditor is mainEditor + sidebar OPEN — panels move OUT of editor into sidebar; `LinkCategorySecondaryEditor` renders the same panel | `LinkEditor === mainEditor && isNavigatorOpen` | `categoriesOnly={true}` (`isMainEditor=true` branch); clicks filter content (`useOpenRawLink=false`) |
| **Standalone-secondary** | LinkEditor is NOT mainEditor (a different file's editor is); LinkCategorySecondaryEditor renders the panel with TreeProviderView semantics | `LinkEditor !== mainEditor` | `useOpenRawLink={true}` — clicks open links via `openRawLink` pipeline; `categoriesOnly={false}` — includes leaf links for navigation |

### Today's registration (`register-editors.ts:460-494` + 696-713)

```typescript
editorRegistry.register({
    id: "link-view",
    name: "Links",
    editorType: "textFile",
    category: "content-view",
    acceptFile: (fileName) => matchesPattern(fileName, /\.link\.json$/i) ? 20 : -1,
    validForLanguage: (languageId) => languageId === "json",
    switchOption: (languageId, fileName) =>
        languageId === "json" && matchesPattern(fileName, /\.link\.json$/i) ? 10 : -1,
    isEditorContent: (languageId, content) =>
        languageId === "json" &&
        content.includes('"type"') &&
        /"type"\s*:\s*"link-editor"/.test(content) &&
        content.includes('"links"'),
    loadModule: async () => {
        const [module, { createLinkViewModel }] = await Promise.all([
            import("./link-editor/LinkEditor"),
            import("./link-editor/LinkViewModel"),
        ]);
        return { Editor: module.LinkEditor, createViewModel: createLinkViewModel, /* … */ };
    },
});

// Three secondary-editor registrations (panel renderers):
secondaryEditorRegistry.register({ id: "link-category",  label: "Categories", loadComponent: () => import(".../LinkCategorySecondaryEditor") });
secondaryEditorRegistry.register({ id: "link-tags",      label: "Tags",       loadComponent: () => import(".../LinkTagsSecondaryEditor") });
secondaryEditorRegistry.register({ id: "link-hostnames", label: "Hostnames",  loadComponent: () => import(".../LinkHostnamesSecondaryEditor") });
```

---

## State after refactor

`LinkEditor` is the page's `mainEditor` under EPIC-028 (LK1 — direct, not a content-view atop TextFileModel). The class HAS a `TextFileModel` as its `IContentHost`, same shape as Monaco / Grid / Markdown / Mermaid / LogView (sixth Tier 5 editor in this shape). Selection-state cache file retires (LK3 — third instance of cache-file → descriptor.state). The view-side `useEffect` "demote survives" hack retires in favor of `beforeNavigateAway` / `onMainEditorChanged` model-side overrides (LK6 + LK7 + LK8).

### Class sketch

```typescript
class LinkEditor extends EditorModel<LinkEditorState, void, LinkQueueEvent> {
    readonly editorId = "link-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;

    // Self-write guard (LK5 — same shape as Log View LV6):
    private skipNextContentUpdate = false;
    // Reference-equality marker for serialization skip:
    private lastSerializedData: LinkEditorData | null = null;
    // Incremental-filter optimization (today's pattern):
    private lastFilterState = { searchText: "", selectedCategory: "", selectedTag: "", selectedHostname: "", expandedPanel: "" };
    // Tree provider — lazy, cleared on host swap:
    private _treeProvider: LinkTreeProvider | null = null;
    // View refs (set via setters from view; not on state):
    private _gridModel: RenderGridModel | null = null;
    private _containerElement: HTMLElement | null = null;

    // Optional callbacks set by sibling editors via duck-typing (LK9 keeps the today-shape):
    onLinkOpen?: (data: ILinkData) => void;
    onGetLinkMenuItems?: (link: LinkItem) => MenuItem[];

    // Save debounce — today's pattern:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    constructor(state: TComponentState<LinkEditorState>) {
        super(state);
        this.traits.set(CONTENT_HOST_TRAIT, {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from LinkEditor");
                this._hostStateUnsub?.();
                this._hostContentUnsub?.();
                this._hostStateUnsub = this._hostContentUnsub = null;
                this._host = null;
                this._treeProvider = null;
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

    // ── Persistence (LK2 + LK3) ────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        return {
            ...super.getRestoreData(),
            state: {
                id: s.id,
                title: s.title,
                modified: s.modified,
                secondaryEditor: s.secondaryEditor,           // LK6 — panel registration rides editor state
                // Per-editor persisted UI slice (LK3 — third instance of cache-file → descriptor.state):
                leftPanelWidth: s.leftPanelWidth,
                expandedPanel: s.expandedPanel,
                selectedCategory: s.selectedCategory,
                selectedTag: s.selectedTag,
                selectedHostname: s.selectedHostname,
                // Stripped (derived from data.links — recomputed on restore via reloadIndices):
                //   categories, categoriesSize, tags, tagsSize, hostnames, hostnamesSize, filteredLinks
                // Stripped (transient UI state):
                //   searchText, selectedLinkId, error
            },
            host: this._host?.getDescriptor(),
        };
    }

    applyRestoreData(data: RestoreData<LinkEditorState>): void {
        this.state.update((cur) => {
            if (data.title !== undefined)            cur.title = data.title;
            if (data.modified !== undefined)         cur.modified = data.modified;
            if (data.secondaryEditor !== undefined)  cur.secondaryEditor = data.secondaryEditor;
            if (data.leftPanelWidth !== undefined)   cur.leftPanelWidth = data.leftPanelWidth;
            if (data.expandedPanel !== undefined)    cur.expandedPanel = data.expandedPanel;
            if (data.selectedCategory !== undefined) cur.selectedCategory = data.selectedCategory;
            if (data.selectedTag !== undefined)      cur.selectedTag = data.selectedTag;
            if (data.selectedHostname !== undefined) cur.selectedHostname = data.selectedHostname;
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
            this.loadData(this._host.state.get().content || "");          // LK4 — initial parse
        } catch (err) {
            ui.notify((err as Error).message || "Failed to restore Link editor.", "error");
            this._host = new TextFileModel();
            this._host.setStorage(this.stateStorage);
            this.adoptHost(this._host);
        }
    }

    private adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._treeProvider = null;   // lazy-recreated against new host
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send());
        // LK4 + LK5 — host content subscription drives re-parse, guarded by self-write flag.
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

    // ── JSON parse/serialize (LK4 / LK5 — verbatim from today's LinkViewModel) ──

    private loadData(content: string): void { /* ... same as today */ }
    private onDataChanged = () => { /* ... same as today; sets skipNextContentUpdate before host.changeContent */ };

    // ── State mutators (today's setters preserved; UiFacade contract preserved) ──

    // Filtering / panel state — addSubscription on state already debounce-saves;
    // also flips state.expandedPanel etc. so the view re-renders.
    setExpandedPanel = (panel: ExpandedPanel): void => { /* ... */ };
    setSelectedCategory = (cat: string): void => { /* ... */ };
    setSelectedTag = (tag: string): void => { /* ... */ };
    setSelectedHostname = (host: string): void => { /* ... */ };
    setSearchText = (t: string): void => { /* ... */ };
    setLeftPanelWidth = (w: number): void => { /* ... */ };

    // Link CRUD — preserved verbatim (addLink, importLinks, updateLink, deleteLink,
    // moveLinkToCategory, moveCategory, pinLink, unpinLink, showLinkDialog, openLink, etc.).

    // ── Sidebar lifecycle hooks (LK6 + LK7 + LK8) ──────────────────────

    /** LK6 — Sidebar panel registration moves from view useEffect into editor lifecycle.
     *  Called by the editor view (or by the page on attach) once the editor is the main
     *  editor and the sidebar is open. Pure state mutation per A8. */
    setSidebarPanels(open: boolean): void {
        if (open) {
            this.secondaryEditor = LINK_PANELS;   // ["link-category", "link-tags", "link-hostnames"]
            // Expand the panel matching the current expandedPanel state.
            const reverseMap = { categories: "link-category", tags: "link-tags", hostnames: "link-hostnames" };
            this.page?.expandPanel(reverseMap[this.state.get().expandedPanel] ?? "link-category");
        } else {
            this.secondaryEditor = undefined;
        }
    }

    /** LK7 — Called by PageModel before this editor is replaced as mainEditor.
     *  LinkEditor survives as a secondary if the panels were active (the user had
     *  the Links sidebar visible); else disposes. */
    beforeNavigateAway(_newModel: EditorModel): void {
        const hadPanels = this.contributesPanels();
        if (hadPanels) {
            // Survive as secondary — sidebar panels stay registered, demote to
            // standalone-secondary mode via onMainEditorChanged below.
            // No need to mutate secondaryEditor; it already has the panel ids.
        } else {
            // No panels were registered (sidebar was closed) — drop cleanly.
            this.secondaryEditor = undefined;
        }
    }

    /** LK8 — Called by PageModel on every editor in editors[] (except new main)
     *  when mainEditor changes. LinkEditor switches its "render mode" by adjusting
     *  the panel list — categories+tags only (drops hostnames) for standalone-secondary
     *  to match today's LinkCategorySecondaryEditor.updatePanels behavior. */
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (newMainEditor === this) return;   // we just became main; nothing to do
        if (newMainEditor === null) return;   // page emptied — nothing to do
        // Demoted to standalone-secondary — adjust panel list to match standalone shape.
        const hasTags = this.state.get().tags.length > 0;
        this.secondaryEditor = hasTags ? ["link-category", "link-tags"] : ["link-category"];
    }

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
        this._treeProvider = null;
        this._containerElement = null;
        this._gridModel = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }

    // ── Tree provider (LK9 — duck-typed today, formalized as optional accessor) ──

    /** Optional accessor consumed by sibling panels (CategoryEditor's tree-provider host
     *  lookup). Returns null when no host (extracted state). */
    get treeProvider(): LinkTreeProvider | null {
        if (!this._host) return null;
        if (!this._treeProvider) {
            this._treeProvider = new LinkTreeProvider(this, this._host.state.get().filePath || "");
        }
        return this._treeProvider;
    }

    selectByHref(href: string): void {
        const link = this.state.get().data.links.find((l) => l.href === href);
        if (link?.id) this.selectLink(link.id);
    }

    selectLink(id: string): void {
        this.state.update((s) => { s.selectedLinkId = id; });
    }

    // ── View refs (set by view; not on state) ──────────────────────────

    setGridModel(model: RenderGridModel | null): void { this._gridModel = model; }
    setContainerElement(el: HTMLElement | null): void { this._containerElement = el; }
    refocus(): void { this._containerElement?.focus(); }
}
```

### State slice shape (LK2)

```typescript
interface LinkEditorState extends EditorStateBase {
    // Persisted (LK3 — folded into EditorDescriptor.state, replacing today's cache file):
    leftPanelWidth: number;
    expandedPanel: ExpandedPanel;             // "tags" | "categories" | "hostnames"
    selectedCategory: string;
    selectedTag: string;
    selectedHostname: string;
    // View-derived — ride state for reactivity, stripped from getRestoreData (MO5 / GR8 / LV2 pattern):
    data: LinkEditorData;                     // ← derived from host.content (recomputed via loadData)
    categories: string[];                     // ← derived from data.links
    categoriesSize: Record<string, number>;
    tags: string[];
    tagsSize: Record<string, number>;
    hostnames: string[];
    hostnamesSize: Record<string, number>;
    filteredLinks: LinkItem[];
    error: string | undefined;
    // Transient UI state — not persisted (matches today's behavior):
    searchText: string;
    selectedLinkId: string;
}
```

The persisted slice is intentionally small (one `number`, one enum-string, three `string` selection fields — total ~120 bytes typical, ~400 bytes worst case for very long category paths). Well under M9's 50KB per-page budget.

### Queue event union (LK10)

```typescript
type LinkQueueEvent = { type: "focus" };       // MO7 — chrome's root-focus follows

// Queue request: never  (script API reads are sync against editor state;
// no view-context queries needed — same as Grid GR10 / Log View LV9)
```

---

## UI shape

```typescript
function LinkEditorView({ model }: { model: LinkEditor }) {
    return (
        <TextChrome
            model={model}
            toolbarContributions={<LinkToolbarBits model={model} />}
            footerContributions={<LinkFooterBits model={model} />}
        >
            <LinkBody model={model} />
        </TextChrome>
    );
}

function LinkBody({ model }: { model: LinkEditor }) {
    const state = model.state.use((s) => ({
        data: s.data, error: s.error, leftPanelWidth: s.leftPanelWidth,
        expandedPanel: s.expandedPanel, filteredLinks: s.filteredLinks,
        searchText: s.searchText, selectedLinkId: s.selectedLinkId,
    }));

    // LK6 — sidebar panel registration ticks on isNavigatorOpen change.
    // The editor exposes setSidebarPanels; the view subscribes to the page's
    // sidebar-open slice and delegates. View no longer mutates model.secondaryEditor
    // directly; cleanup function disappears entirely.
    const isNavigatorOpen = useOptionalState(
        model.page?.pageNavigatorModel?.state,
        (s) => s.open,
        false,
    );
    useEffect(() => {
        if (model.page?.mainEditor === model) model.setSidebarPanels(isNavigatorOpen);
    }, [isNavigatorOpen, model]);

    // LK11 (focus event handler — same shape as MO7 / GR10 / LV8):
    model.queue.use((ev) => {
        if (ev.type === "focus") model.refocus();
    });

    if (state.error) return <EditorError>{state.error}</EditorError>;

    const showPanelsInSidebar = isNavigatorOpen;

    return (
        <Panel
            name="link-editor-root"
            ref={(el) => model.setContainerElement(el)}
            tabIndex={-1}
            direction={swapLayout ? "row-reverse" : "row"}
            overflow="hidden"
            flex={1}
        >
            {/* In-editor side panels — only when sidebar is closed */}
            {!showPanelsInSidebar && (<><CollapsiblePanelStack …>{/* 3 panels */}</CollapsiblePanelStack><Splitter … /></>)}

            <HighlightedTextProvider value={state.searchText}>
                <Panel name="link-editor-center" /* drop-zone + grid/tiles */>
                    {/* … same as today: empty / no-results / list / tiles … */}
                </Panel>
            </HighlightedTextProvider>

            {/* Pinned panel (when any pinned links) */}
            {/* … same as today … */}
        </Panel>
    );
}

function LinkToolbarBits({ model }: { model: LinkEditor }) {
    const state = model.state.use((s) => ({
        expandedPanel: s.expandedPanel, selectedCategory: s.selectedCategory,
        selectedTag: s.selectedTag, selectedHostname: s.selectedHostname,
        searchText: s.searchText, viewMode: model.getViewMode(),
    }));
    return (
        <>
            {/* Breadcrumb (categories / tags / hostnames) — moves OUT of toolbar-first portal,
                becomes the first inline child per walkthrough 09 / PT3 / PT4 */}
            {state.expandedPanel === "tags" ? <Breadcrumb … /> :
             state.expandedPanel === "hostnames" ? <Breadcrumb … /> :
             <Breadcrumb … />}
            <Spacer />
            <Button name="link-editor-add" icon={<PlusIcon />} onClick={() => model.showLinkDialog()}>Add Link</Button>
            <Button name="link-editor-view-mode" icon={VIEW_MODE_ICONS[state.viewMode]} onClick={…}>{VIEW_MODE_LABELS[state.viewMode]}</Button>
            <Input name="link-editor-search" value={state.searchText} onChange={model.setSearchText} placeholder="Search..." />
        </>
    );
}

function LinkFooterBits({ model }: { model: LinkEditor }) {
    const { filteredLinks, allLinks } = model.state.use((s) => ({
        filteredLinks: s.filteredLinks, allLinks: s.data.links,
    }));
    return <span>{filteredLinks.length === allLinks.length ? `${allLinks.length} links` : `${filteredLinks.length} of ${allLinks.length} links`}</span>;
}
```

### `accepts()` (registry) — LK10

```typescript
accepts({ host, fileName, language }): number {
    if (fileName && /\.link\.json$/i.test(fileName)) return 70;   // strong filename match
    if (language === "json" && host) {
        const content = host.state.get().content;
        if (content.includes('"type"') && /"type"\s*:\s*"link-editor"/.test(content) && content.includes('"links"')) {
            return 60;                                              // content-peek fallback
        }
    }
    return -1;
}
```

Replaces today's `acceptFile` (filename) + `validForLanguage` (language) + `switchOption` (language + filename) + `isEditorContent` (language + content peek) quartet with the single `accepts` predicate. Same priority calibration as Grid / Log View (filename: 70, content-peek: 60).

---

## Switch in / out

- **Switch in via `switchFrom(oldEditor)`** — trait closure extracts host; id copied; storage rebound; `adoptHost` subscribes content + descriptorChanged forwarders; **and** `restore()` follow-up calls `loadData(host.state.get().content)` to populate the link collection against the inherited content. Same shape as Grid GR7 / Log View LV4.
- **Switch out** — trait closure unsubscribes forwarders, nulls `_treeProvider`, returns host. Editor disposes; queue drains; host transfers intact. Sibling-panel duck-typed reads (`treeProvider`, `selectByHref`) on LinkEditor become null/no-op while the new editor takes over.
- **Switch widget visibility** — `findCompatibleEditors()` returns `["link-view", "monaco"]` for a `.link.json` file (content matches link-editor + json is Monaco-compatible). Per PT10 the widget shows when length ≥ 2 AND current id is in the list — true for both directions.

---

## Sidebar lifecycle (LK6 + LK7 + LK8)

Three model-side hooks coordinate the panel registration without any view-side write to `model.secondaryEditor`:

| Trigger | Hook | Behavior |
|---------|------|----------|
| Sidebar open/close toggle (user clicks NavPanel button) while LinkEditor is mainEditor | `LinkBody` view useEffect calls `model.setSidebarPanels(open)` | Sets `state.secondaryEditor = LINK_PANELS` (open) or `undefined` (closed); expands the current `expandedPanel` |
| User navigates to a different file in the same page (`page.navigatePageTo(newPipe)`) | `beforeNavigateAway(newModel)` on LinkEditor | If panels were registered (sidebar was open) → keeps `secondaryEditor` set → page detects LinkEditor is "still contributing panels" and keeps it in `editors[]` per visibility criterion (Pattern B / today's "demote survives") |
| Main editor changes (page now hosts e.g. Monaco for a `.ts` file) | `onMainEditorChanged(newMain)` on demoted LinkEditor | LinkEditor adjusts its panel list to standalone-secondary shape: `["link-category", "link-tags"]` (with-tags) or `["link-category"]` (no tags) — drops "link-hostnames" to match today's `LinkCategorySecondaryEditor.updatePanels` behavior |
| User clicks "Swap" button on LinkCategorySecondaryEditor header | Panel calls `page.promoteSecondaryToMain(linkEditor)` | Page-level: LinkEditor becomes mainEditor again; `onMainEditorChanged` fires on whichever editor was main; LinkEditor's `secondaryEditor` re-expands to `LINK_PANELS` (full set) on next `setSidebarPanels(true)` call from the view |
| LinkEditor was a secondary already and the user navigates main away → no further LinkEditor demote (we are already demoted) | (no hook fires on us) | Stable — LinkEditor stays as secondary contributing `link-category` + `link-tags` |
| LinkEditor is closed via the panel close button (×) | `LinkCategorySecondaryEditor` panel React component calls `model.secondaryEditor = undefined` | Setter is pure state per A8; visibility criterion fails (`mainEditorId !== model.id && contributesPanels() === false`); PageModel detaches + disposes |
| Page closes | `PageModel.close()` → per-editor `dispose()` | Today's pattern — flush, unsub, host dispose |

The view-side `useEffect` cleanup function that today guards against destroying panels during demote **disappears entirely** — the cleanup branch was only needed because the view was responsible for writing `secondaryEditor`. Once `beforeNavigateAway` keeps the panels alive (model-side), the view's useEffect can run a clean `model.setSidebarPanels(false)` cleanup without affecting the demote path (because by the time the view unmounts during a navigate-away, `beforeNavigateAway` has already run and the panels are already registered for the demote case).

Actually subtler: when `beforeNavigateAway` survives the editor as secondary, the React component for LinkEditor's body still unmounts (the page now renders a different editor's body). The cleanup function inside the body's useEffect must not run `setSidebarPanels(false)` in the survive case — because that would clear the panels we just decided to keep. Solution: `setSidebarPanels` is gated on `model.page?.mainEditor === model` inside the model (already in the sketch above). When the body unmounts AFTER `beforeNavigateAway` has demoted us, `mainEditor` is the NEW editor, not us; the cleanup's `setSidebarPanels(false)` is a no-op. Clean.

---

## Three render modes for `LinkCategoryPanel` (LK8)

Today: three modes baked into the panel's props (`useOpenRawLink`, `categoriesOnly`, `pageId`). Each combination maps to one of the three modes; the mode is determined by who renders the panel.

Under EPIC-028 nothing about the panel itself changes — it stays a pure component receiving its mode via props. What changes is **who passes which props**:

| Mode | Renderer | Props (today) | Props (after) |
|------|----------|---------------|---------------|
| **Main-editor, sidebar-closed** (panels live INSIDE LinkBody) | `LinkBody.tsx` | `useOpenRawLink={false} categoriesOnly={false}` | unchanged |
| **Main-editor, sidebar-open** (panels live in sidebar via secondary editor) | `LinkCategorySecondaryEditor.tsx` `isMainEditor=true` branch | `useOpenRawLink={false} categoriesOnly={true}` | unchanged |
| **Standalone-secondary** (LinkEditor demoted or attached alongside a different main editor) | `LinkCategorySecondaryEditor.tsx` `isMainEditor=false` branch | `useOpenRawLink={true} categoriesOnly={false} pageId={page?.id}` | unchanged |

`LinkCategorySecondaryEditor`'s `isMainEditor` discriminator becomes `mainEditorId === model.id` (today's pattern, just via the EPIC-028 unified-array's `_mainEditorId` field).

**Today's view-side duck-typing block** in `LinkCategorySecondaryEditor.tsx:37-52` (which writes `m.treeProvider = vm.treeProvider`, `m.selectionState = …`, `m.selectByHref = …` onto the model) **retires**: under LK9, the LinkEditor class exposes these as proper accessors/methods (`get treeProvider()` and `selectByHref(href)` are public on LinkEditor; `selectionState: TOneState<NavigationState>` becomes a public field initialized in the constructor when needed by a secondary panel).

`LinkCategorySecondaryEditor`'s updatePanels useEffect (lines 57-71) **retires entirely** — replaced by `LinkEditor.onMainEditorChanged` (LK8) which writes the standalone-secondary panel list model-side as the demote happens, no view subscription needed.

---

## Persistence

### `getRestoreData()` output

```typescript
{
    editorId: "link-view",
    id: "<uuid>",
    state: {
        title, modified, secondaryEditor,
        leftPanelWidth, expandedPanel,
        selectedCategory, selectedTag, selectedHostname,
    },
    host: {
        kind: "textFile",
        state: { id, content: "", language: "json", filePath, modified, encoding, encrypted, temp },
        pipe: { provider, transformers, encoding },
    },
}
```

Note: `content` lives in the host descriptor's state slice as the cache-keyed reference (P4); the actual JSON bytes stay in the per-editor cache file (`<editor.id>-host.txt`) per M9's invariant. The `data.state.{categoryViewMode, tagViewMode, hostnameViewMode, pinnedLinks, pinnedPanelWidth}` fields (today's per-collection UI state riding the JSON file) stay where they are — inside the link JSON file itself, not in the descriptor. Per-window UI state (which category is selected RIGHT NOW) goes to descriptor; per-collection UI state (how this collection prefers to look) stays in the file.

### Persisted slice size envelope (LK3)

Realistic distribution:
- Typical: `leftPanelWidth=200, expandedPanel="categories", selectedCategory="dev/tools", selectedTag="", selectedHostname=""` — ~80 bytes JSON-serialized.
- Worst plausible: very deep category path (`selectedCategory="vendor/foo/bar/baz/qux/quux"`) + long tag (`selectedTag="lang:typescript:advanced"`) + long hostname — ~250 bytes.

Two orders of magnitude under M9's 50KB per-page budget. Folding into descriptor matches Grid GR4 + Log View LV3 — third instance of the cache-file → descriptor.state consolidation pattern.

### Migration from today's format

Per C2: no migration shim. Today's session data with `editor: "link-view"` and `type: "textFile"` hits walkthrough 04 / P2's detect-and-skip path on first boot post-upgrade. The orphaned `<old-host.id>-link-editor.txt` cache files (today's per-collection selection state) get collected by per-editor `fs.deleteCacheFiles(editor.id)` on future dispose, or linger harmlessly per P9's no-sweep decision.

---

## Scripting

### `LinkEditorFacade` shape after refactor

```typescript
class LinkEditorFacade {
    constructor(private readonly editor: LinkEditor) {}

    // SF1 — addLink / openLink / etc. preserved
    addLink(link: Partial<LinkItem>): LinkItem { return this.editor.addLink(link); }
    deleteLink(id: string, skipConfirm = false): Promise<void> { return this.editor.deleteLink(id, skipConfirm); }
    importLinks(items: ILink[]): Promise<void> { return this.editor.importLinks(items); }
    // … updateLink, openLink, selectLink, getViewMode, setViewMode, … all preserved
}
```

`page.asLink(force?: boolean)` — SF1's `force?: boolean` pattern. When `force=true`, calls `findCompatibleEditors()` to check Link-view is compatible with the current host; if so, dispatches `page.switchMainEditor("link-view")` and returns the facade. Else throws.

---

## Lifecycle hooks

| Hook | LinkEditor |
|------|------------|
| `applyRestoreData` | ✅ — leftPanelWidth, expandedPanel, selectedCategory/Tag/Hostname |
| `switchFrom` | ✅ same shape as Grid / preview group / LogView |
| `restore` | ✅ — host load + initial JSON parse via `loadData` |
| `saveState` | ✅ — flush onDataChanged + delegate `host.io.saveState()` |
| **`beforeNavigateAway`** | ✅ — **LK7** — keeps `secondaryEditor` set so Page keeps us in `editors[]` via visibility criterion; pattern matches Archive (S8) |
| **`onMainEditorChanged`** | ✅ — **LK8** — adjusts panel list to standalone-secondary shape (drops "link-hostnames") |
| `confirmRelease` | ✅ — delegate host |
| `isFreshEmpty` | ❌ inherit (false) |
| `getNavigatorTarget` | ✅ — host's `{pipe, filePath}` |
| `hasTextSelection?` | ❌ inherit (undefined) |
| `findCompatibleEditors` | ✅ — `findEditorsAccepting(host)` |
| `getRestoreData` | ✅ — strip derived (categories/tags/hostnames/filteredLinks/searchText/selectedLinkId/error/data) |
| `getIcon` / `noLanguage` | ❌ inherit |
| `focus` | ✅ — send `{ type: "focus" }` |
| `dispose` | ✅ — flush save + unsub + host dispose |

**First Tier 5 editor to override `beforeNavigateAway` AND `onMainEditorChanged`** — Archive is the other override site (deferred to walkthrough 30 / no-host group); LinkEditor is the first text-bearing one.

---

## Concerns

### LK1 — Class topology: direct `LinkEditor` (with TextFileModel host) or content-view on top of TextFileModel?

Today: `TextFileModel` IS the page's `mainEditor`; `LinkViewModel` is a `ContentViewModel<LinkEditorState>` acquired via `useContentViewModel("link-view")` on the host.

Under EPIC-028 the ViewModel machinery retires (SF2 fully completed by walkthrough 23 / LV9). Three readings:

(a) **`LinkEditor` IS the page's mainEditor; HAS a `TextFileModel` content host.** Same shape as Monaco / Grid / Markdown / Mermaid / LogView. CONTENT_HOST_TRAIT exposed. Switch-to-Monaco works (view raw `.link.json` text). File / pipe / save-restore machinery delegated to host.

(b) **`LinkEditor` IS the page's mainEditor; owns the file directly (no IContentHost).** No CONTENT_HOST_TRAIT. File path, content, pipe owned directly by LinkEditor. Switch-to-Monaco impossible.

(c) **Hybrid — internal-only host without trait exposure.** No CONTENT_HOST_TRAIT; switch-to-Monaco impossible; raw-edit via "Open as text" menu only.

**RESOLVED 2026-05-20** — Option (a) confirmed. Same reasoning as LV1 (uniformity with Tier 5; switch-to-Monaco meaningful for `.link.json` since users may need to hand-edit a corrupted entry; host machinery reuse). **Sixth Tier 5 editor** in the uniform "EditorModel IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT exposed" shape. Rejected (b) own-the-file-directly — duplicates host machinery; breaks switch-to-Monaco. Rejected (c) internal-only — adds opaque branch for no benefit; CONTENT_HOST_TRAIT is the natural exposure point. No mockup change required.

### LK2 — State slice partitioning: which fields persist, which ride state for reactivity, which become private?

Today's `LinkEditorState` has 16 fields; the model has 7 private fields plus 2 optional callback fields. Under EPIC-028 each lands in one of three layers:

(a) **Three layers as documented in the class sketch:**
- **Persist via `getRestoreData`**: `leftPanelWidth`, `expandedPanel`, `selectedCategory`, `selectedTag`, `selectedHostname` (5 fields — the today's selection-state cache file content, plus `leftPanelWidth` which today rides state without per-window persistence — folding into descriptor adds it as a side bonus).
- **Ride state for reactivity, strip from descriptor** (MO5/GR8/LV2 pattern): `data`, `error`, `categories`, `categoriesSize`, `tags`, `tagsSize`, `hostnames`, `hostnamesSize`, `filteredLinks`, `searchText`, `selectedLinkId` (11 fields — all derived from `host.content` via `loadData`, or transient UI state).
- **Stay private (non-state)**: `_skipNextContentUpdate`, `_lastSerializedData`, `_lastFilterState`, `_treeProvider`, `_gridModel`, `_containerElement`, `onLinkOpen?`, `onGetLinkMenuItems?` (8 fields — bookkeeping + DOM/view refs + sibling-set callbacks).

(b) **Persist `searchText` and `selectedLinkId` too** for cross-restart continuity (user reopens a `.link.json` file and finds their last search + selection intact).

(c) **Persist nothing at all** — drop selection-state cache entirely; force fresh "Categories root, no selection" on every page open. Same form as PV6's (c) option.

**RESOLVED 2026-05-20** — Option (a) confirmed. The five persisted fields match today's selection-state cache exactly (1:1 mapping to what's in `<host.id>:link-editor` today); plus `leftPanelWidth` which today is forgotten on restart (silent today-bug — **incidentally fixed by the consolidation**). Rejected (b) persist searchText + selectedLinkId — transient UI state; reopening a file and finding a stale search is a worse UX than reopening with a clean slate. Rejected (c) persist nothing — regresses today's good behavior (users notice when their last expanded category is forgotten). No mockup change required.

### LK3 — Selection-state cache retirement: fold into descriptor or keep separate cache file?

Today: `<host.id>:link-editor` cache file via `host.stateStorage.setState(host.id, "link-editor", JSON.stringify({expandedPanel, selectedCategory, selectedTag, selectedHostname}))`. Debounced 300ms. Read once on first `loadData` via `selectionRestored` one-shot guard.

Under EPIC-028 with EditorDescriptor.state riding the per-window descriptor save:

(a) **Fold into `EditorDescriptor.state` per LK2 (a).** Mirrors Grid GR4 + Log View LV3 decisions. Eliminates the dedicated cache file. Single source of truth: editor state → descriptor; host content → cache file. Window-level 500ms debounce per P3 replaces today's 300ms.

(b) **Keep separate cache file `<editor.id>-link-editor.json`**. Preserves today's pattern. Editor-private; lower descriptor footprint (~120 bytes saved per page).

(c) **Hybrid: persist `expandedPanel` only via descriptor; keep selection fields in cache file**. Splits the cache file content; over-engineered.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons identical to GR4 / LV3:
1. **Mirrors Grid GR4 + Log View LV3** — **third instance** of the pattern; consistency across Tier 5 editors with per-window UI state.
2. **Unifies persistence** — one less per-editor cache file to track; one less restore-time async-await path (today's `restoreSelectionState` + `selectionRestored` one-shot guard both retire).
3. **IPC drag transfer naturally atomic** — descriptor carries everything; no separate-cache-file race during cross-window drag.

Rejected (b) — duplicates the today-pattern that GR4 + LV3 eliminated for the same reasons. Rejected (c) — premature splitting. **Third instance of "per-editor cache file → descriptor.state" pattern (Grid GR4 → Log View LV3 → Link LK3).** No mockup change required.

**Amended 2026-05-21 by HS1.** Folds into `host.editorSettings["link-view"]`, not `EditorDescriptor.state`. `leftPanelWidth` + `expandedPanel` + `selectedCategory/Tag/Hostname` ride the host slot — survive Link↔Monaco switches (user toggles to raw JSON, switches back; selected category stays put) AND app restarts (same descriptor save path). The `selectionRestored` one-shot flag still retires, just via the host-slot seed in `adoptHost` instead of a separate cache-restore step. Implementation pinned by `doc/tasks/US-552-B-host-managed-editor-view-state/README.md`.

### LK4 — JSON parse/serialize lifecycle hooks under EPIC-028

Today's `LinkViewModel` lifecycle:
- `onInit` — state subscription → debounced save; initial `loadData(host.content)` (which also kicks off async `restoreSelectionState`)
- `onContentChanged(content)` — guards on `skipNextContentUpdate`; else `loadData(content)`
- `onDispose` — flushes pending save via `this.onDataChanged()`

Under EPIC-028 / SF2:

(a) **Three-site split (mirrors LV4):**
- `restore()` — sets up state subscription → `onDataChangedDebounced`; calls `loadData(host.content)` initial parse; `selectionRestored` flag retires per LK3 (selection state arrives via `applyRestoreData` from descriptor, not from a separate cache file).
- `adoptHost` content subscription — calls `loadData(content)` with `skipNextContentUpdate` guard.
- `dispose()` — flushes pending save; unsubs forwarders; nulls refs; host dispose.

(b) **Single editor-level `loadData` for both initial and incremental** — drop the redundant subscription-during-restore pattern; tie initial load to first `adoptHost`. Slightly fewer lines; equivalent observable behavior.

(c) **Defer parse until first read** — lazy parse on first view subscribe. Adds complexity.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three sites as described. Mechanical fall-out from SF2 + LK3. Mirrors Log View LV4's three-site shape. The state→save subscription happens once in `restore()` (not in `adoptHost`, which fires on switch-in too — we don't want to re-subscribe). Rejected (b) tie initial-load to adoptHost — couples concerns (host adoption vs. initial parse + state subscription setup); fragile when switchFrom adopts an already-parsed host. Rejected (c) lazy parse — adds complexity. No mockup change required.

### LK5 — `skipNextContentUpdate` flag under host subscription (mirrors LV6)

Today's mechanism: identical to Log View LV6 — editor's mutators set `skipNextContentUpdate = true`, then call `host.changeContent(newContent, true)`. Host's content subscription fires; the editor reads + resets the flag and skips re-parsing.

Under EPIC-028, three candidates (same as LV6):

(a) **Keep `skipNextContentUpdate` flag** — verbatim port.
(b) **Pass `bySelf` parameter to `host.changeContent(content, bySelf)`** — leaks editor concern into host API.
(c) **TOneState change-reason tracking on host** — over-engineered for two consumers (LogView + LinkEditor).

**RESOLVED 2026-05-20** — Option (a) confirmed. Same reasoning as LV6 — flag is editor-private; race is editor-internal; today's pattern works. **Second instance of the self-write-guard pattern** in EPIC-028 (after LogView LV6). The pattern is now standardized: any append-or-mutate-then-serialize editor that writes back to its host via `host.changeContent` carries this flag. Rejected (b) host-side `bySelf` parameter — leaks editor concern into host API. Rejected (c) change-reason tracking — over-engineered for 2 consumers. No mockup change required.

### LK6 — Sidebar panel registration: model.secondaryEditor write ownership

Today: a view-side `useEffect` inside `LinkEditor.tsx` writes `model.secondaryEditor = LINK_PANELS` based on `isNavigatorOpen` state, and clears it in the cleanup function (with the demote early-return). The view holds page-level knowledge (sidebar open/closed) and translates it into model mutation.

Under EPIC-028 the question is "who owns this write?":

(a) **Model-side method `setSidebarPanels(open: boolean)` called by view's useEffect.** Same trigger source (`isNavigatorOpen` from `page.pageNavigatorModel.state`), but the write goes through a typed model method. View becomes pure dispatcher: `useEffect(() => model.setSidebarPanels(isNavigatorOpen), [isNavigatorOpen])`. Model's `setSidebarPanels` is gated on `page.mainEditor === model` so demote-survives cases no-op. The clearing happens via `setSidebarPanels(false)` (view-side cleanup) OR via `beforeNavigateAway` (LK7) when the editor is demoted.

(b) **Model subscribes to its own page's sidebar slice** via N1-style TOneState selector subscription, set up in `restore()` / `attach()`. View has no useEffect. Cross-layer coupling: editor reaches into page's `pageNavigatorModel.state.open` via a selector subscription.

(c) **Stay view-side; rewrite cleanup function** to use the new `beforeNavigateAway` hook information (the page tells the model "you are being demoted" before unmount). Cleanest change-detection; preserves today's surface shape.

**RESOLVED 2026-05-20** — Option (a) confirmed. The view's role is "translate UI events to model commands" — the view IS the right layer to read `isNavigatorOpen` from `page.pageNavigatorModel` (already does). The MODEL is the right layer to decide what to write into its own `secondaryEditor` state. Splitting at this seam:
- View calls `model.setSidebarPanels(isNavigatorOpen)` whenever the trigger fires.
- Model writes `state.secondaryEditor` AND handles the corner case (`mainEditor !== model` no-ops).
- Demote-survives lives in `beforeNavigateAway` (LK7) — no view-side cleanup conditional.

Rejected (b) model-subscribes-to-page-state — extra cross-layer coupling for negligible gain; violates "the editor doesn't know about page-level UI state" intent. Rejected (c) stay-view-side — doesn't address the actual smell (view writing model.secondaryEditor with a non-trivial conditional). No mockup change required (the setter is already pure state per A8; `setSidebarPanels` is one editor's method).

### LK7 — `beforeNavigateAway` hook usage — first Tier 5 exercise

Per `mockups/EditorModel.ts:292-297`, `beforeNavigateAway(newModel)` base behavior clears `secondaryEditor`. Subclasses override to inspect `newModel.sourceLink` and keep panels if relevant (Archive's pattern per S8).

For LinkEditor, the trigger is "user navigates main editor to a different file in the same page" (e.g., from a `.link.json` to a `.ts` file). Today's view-side cleanup's early-return handles this case ("if I'm still in secondaryEditors[], don't clear my panels"). Under EPIC-028:

(a) **Override `beforeNavigateAway(newModel)` — keep panels if any were registered (i.e., if `contributesPanels()` is true).** Survival criterion: "the user had the Links sidebar open when they navigated away — they probably want to keep the Links accessible from the sidebar of the new file."

(b) **Override `beforeNavigateAway(newModel)` — always survive.** Even if the sidebar was closed, demote to standalone-secondary so the user can re-open the sidebar later and find the Links panel.

(c) **Override `beforeNavigateAway(newModel)` — only survive if `newModel.sourceLink.sourceId` indicates an internal link navigation** (mirrors Archive's pattern from S8). Pure-link-following keeps the panels; raw-edit-then-navigate-elsewhere drops them.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **Matches today's behavior** — today's view-side cleanup early-returns when LinkEditor is still in `secondaryEditors[]`; LinkEditor only ends up in `secondaryEditors[]` if `model.secondaryEditor` was non-empty when the demote happened; `secondaryEditor` is non-empty iff the sidebar was open (per LK6 / today's view useEffect). So "survive if `contributesPanels()`" is exactly today's discriminator, just expressed model-side.
2. **Right user intent** — sidebar-open is the user signaling "I want my links accessible right now." Sidebar-closed is "I'm just looking at the file" — no need to keep Link panels registered. Option (b) over-eagerly clutters the sidebar; option (c) requires sourceLink discrimination that today's behavior doesn't need.
3. **First-text-bearing-editor exercise of the hook** — Archive's S8 pattern (sourceLink.sourceId discrimination) belongs to walkthrough 30; LinkEditor here keeps it simpler (current-state discriminator only).

Rejected (b) always-survive — clutters the sidebar with panels the user didn't ask for. Rejected (c) sourceLink-discrimination — Link doesn't have an "I was opened from a parent" identity to gate on (unlike Archive which opens children FROM the archive tree). Adds complexity for no observable benefit. **B1 mockup adjustment NOT landed** — the optional doc-comment refinement on `EditorModel.beforeNavigateAway:292-294` is deferred; Archive's S8 sourceLink-based pattern stays the canonical example in the mockup, and the LinkEditor override demonstrates the second valid discriminator shape (current-state-based) by example. If a third text-bearing override using yet another shape lands, revisit the doc comment then.

### LK8 — `onMainEditorChanged` hook usage — first Tier 5 exercise + render-mode adjustment

Per `mockups/EditorModel.ts:299-303`, `onMainEditorChanged(newMainEditor)` fires on every editor in `page.editors[]` (except the new main) when mainEditor changes. Default: no-op.

For LinkEditor, the trigger pattern is: LinkEditor was main → user navigated away → `beforeNavigateAway` kept panels → page now sets the new main → `onMainEditorChanged` fires on demoted LinkEditor. The opportunity is to switch the panel list from main-mode shape (Categories + Tags + Hostnames) to standalone-secondary shape (Categories + Tags only, matching today's `LinkCategorySecondaryEditor.updatePanels` behavior — Hostnames panel hidden when LinkEditor is not main):

(a) **Override `onMainEditorChanged(newMain)` to adjust panel list to standalone-secondary shape.** Drops "link-hostnames"; keeps "link-category"; conditionally keeps "link-tags" based on `state.tags.length > 0`. Replaces today's `LinkCategorySecondaryEditor.updatePanels` useEffect.

(b) **Keep all three panels visible always** (main and standalone-secondary modes show the same panel set). Diverges from today's behavior — users will see a Hostnames panel for `.link.json` collections even when they're navigating other files. Probably acceptable but a UX regression.

(c) **Move the panel-set-adjustment into `beforeNavigateAway` (LK7) directly.** Set the standalone-secondary shape before the new main lands. Equivalent end state; just collapses two hooks into one.

**RESOLVED 2026-05-20** — Option (a) confirmed. Replaces today's `LinkCategorySecondaryEditor.updatePanels` useEffect with a model-side override that fires at exactly the right moment (after the main editor swap). Rejected (b) — today's UX choice (hide Hostnames panel when not main) is deliberate; keeping it preserves users' mental model. Rejected (c) — `beforeNavigateAway` fires BEFORE the new main is set, so adjusting the panel set there means responding to a transitional state; `onMainEditorChanged` fires AFTER the swap, which is the right moment for "what should I look like now?" decisions. The view-side updatePanels useEffect AND its `vm.state.subscribe(updatePanels)` tag-list subscription **both retire** — `onMainEditorChanged` plus a second subscription inside the editor's `restore()` (subscribe to `state.tags` slice and re-call adjustPanels when tag count crosses zero) covers the same dynamic. No mockup change required — `onMainEditorChanged` is already in `mockups/EditorModel.ts:299-303`; LK8's logic adds a `state.tags` subscription inside `restore()` to handle the tag-count-crosses-zero case, which is pure model internals.

### LK9 — TreeProvider integration: duck-typing or typed interface?

Today's `LinkCategorySecondaryEditor.tsx:37-52` writes three fields onto the model via duck-typing (cast to `any`):
```typescript
m.treeProvider = vm.treeProvider;
m.selectionState = new TOneState<NavigationState>({selectedHref: null});
m.selectByHref = (href: string) => { /* find link by href + selectLink */ };
```
These are consumed by the sibling CategoryEditor's `findTreeProviderHost()` to render a unified TreeProviderView spanning Explorer + Archive + Link sources.

Under EPIC-028 the question is "where do these fields live, and what's their type?":

(a) **Typed accessors/methods on LinkEditor class directly.** `get treeProvider(): LinkTreeProvider | null` (lazy via `_treeProvider` field), `selectByHref(href: string): void` public method, `selectionState: TOneState<NavigationState>` public field initialized in constructor. CategoryEditor's `findTreeProviderHost` checks `editor instanceof LinkEditor` (or another known TreeProvider source). No `any` casts; types flow.

(b) **A new optional trait `TREE_PROVIDER_TRAIT`** declared on `mockups/traits.ts` exposing `getTreeProvider(): ITreeProvider | null`, `getSelectionState(): TOneState<NavigationState>`, `selectByHref(href: string): void`. CategoryEditor reads via `editor.traits.get(TREE_PROVIDER_TRAIT)?.getTreeProvider()`. More extensible (Archive, Explorer can also opt in); pays off if there are 3+ providers.

(c) **Keep today's duck-typing** — write the three fields via `(model as any).treeProvider = …`; CategoryEditor reads via the same `any` cast. Cheap migration; ugly types.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **Right level of formalization** — LinkEditor IS a tree-provider-source by design; the methods belong on its class interface, not under a generic trait. Archive + Explorer are likely also tree-provider sources, but they're no-host editors (walkthrough 30) — when those land, they'll get the same typed accessors on their classes. Discoverability through class types beats trait-key lookup for this use case (1-3 sources per editor, not a dozen).
2. **Eliminates today's `(m as any)` casts** — both in the writer (LinkCategorySecondaryEditor) and in the reader (CategoryEditor's `findTreeProviderHost`). **Three `any` casts retire.**
3. **Trait registration is the wrong shape** — TraitSet is for behaviors that the consumer carries (drag-and-drop, content-host extraction). Tree-provider is "what data do you expose"; the natural way to expose data is class methods. Sub-options (b/c) considered; (b) adds infrastructure for 1-3 consumers (over-formalization), (c) leaves the ugly casts.

Rejected (b) TREE_PROVIDER_TRAIT — over-formalization; if a fourth tree-provider source ever lands and the union grows unwieldy, revisit. Rejected (c) duck-typing — fails the EPIC-028 typed-API goal; the today-pattern's `(m as any).treeProvider = vm.treeProvider` write was a workaround for ContentViewModel/host indirection, which goes away under SF2. No mockup change required. The `findTreeProviderHost` real-code change moves from `(m as any).treeProvider` to `editor instanceof LinkEditor ? editor.treeProvider : (editor instanceof ArchiveEditor ? editor.treeProvider : (editor instanceof ExplorerEditor ? editor.treeProvider : null))` (the instanceof chain grows by one class per editor that exposes the accessor; today's three exposers — Link, Archive, Explorer — keep the same source).

### LK10 — Registry surface: `accepts()` predicate + queue event union

Today four predicates: `acceptFile` (filename), `validForLanguage` (language), `switchOption` (language + filename), `isEditorContent` (language + content match). Under EPIC-028 the registry mockup collapses all to a single `accepts({host, fileName, language, mode}): number`.

Candidate shapes (mirrors LV10):

(a) **Filename-strong, content-peek fallback** (priorities 70 / 60):
```typescript
accepts({host, fileName, language}): number {
    if (fileName && /\.link\.json$/i.test(fileName)) return 70;
    if (language === "json" && host) {
        const content = host.state.get().content;
        if (content.includes('"type"') && /"type"\s*:\s*"link-editor"/.test(content) && content.includes('"links"'))
            return 60;
    }
    return -1;
}
```
Queue events: `{ type: "focus" }` only; queue request: `never`. Same minimal shape as Grid GR10 / Log View LV8.

(b) **Filename-only** — drop content-peek. `.json` files without `.link.json` extension can't be detected as link collections.

(c) **Add `scrollToLink` queue event** — proactively for future `page.asLink().scrollToLink(href)` script API. No current consumer.

**RESOLVED 2026-05-20** — Option (a) confirmed. Three reasons:
1. **Mirrors LV10 calibration** — filename 70 + content-peek 60 across Tier 5 maintains a coherent priority space. JSON files generated by scripts that happen to contain `"type":"link-editor"` get the switch-widget option to view as Links.
2. **Minimal queue matches today's UI affordances** — no script API today wants to scroll-to-link; no per-entry highlight; no progress-style UI. YAGNI on (c).
3. **Symmetric with Tier 5 siblings** — Markdown / Svg / Html / Mermaid / LogView all minimal-queue; LinkEditor follows the pattern.

Rejected (b) — drops switch-widget visibility for content-matching JSON. Rejected (c) — premature scaffolding (PV7/PV8/LV8 same rejection). No mockup change required.

---

## Mockup adjustments

**Zero mockup changes landed.** All ten concerns resolve at the real-code layer.

The optional doc-comment refinement flagged under LK7 (B1) was **NOT landed** — Archive's S8 sourceLink-based pattern stays the canonical example in `EditorModel.beforeNavigateAway`'s doc comment; the LinkEditor override demonstrates the second valid discriminator shape (current-state-based) by example. If a third text-bearing editor introduces yet another discriminator shape, revisit the doc comment then.

The walkthrough 20 / 21 / 22 / 23 template (state slice + queue unions + view + accepts + lifecycle overrides + persistence + optional overrides + CONTENT_HOST_TRAIT) carries LinkEditor end-to-end. Tier 5 template stability holds across the **first sidebar-owning editor** — a topologically different shape from every prior Tier 5 entry. The eight-piece template slots cleanly; the two new lifecycle-hook overrides (`beforeNavigateAway` + `onMainEditorChanged`) fit alongside the existing override list without adding base-class machinery.

---

## Migration scope

Real-code only (carried to implementation):

- **New files** (two):
  - `src/renderer/editors/link-editor/LinkEditor.ts` — `LinkEditor` class + `LinkEditorState` + `LinkQueueEvent`.
  - `src/renderer/editors/link-editor/LinkEditorView.tsx` — view shell: `<TextChrome>` + `<LinkBody>` + `<LinkToolbarBits>` + `<LinkFooterBits>`.

- **Renamed / refactored files**:
  - `LinkViewModel.ts` deletes — state shape + setters + private fields + JSON parse/serialize + entry mutators all absorb into `LinkEditor.ts`. `createLinkViewModel` factory removed.
  - Today's `LinkEditor.tsx` renames to `LinkBody.tsx` — drops `useContentViewModel`, drops `useSyncExternalStore` (replaced by `model.state.use()`), drops the `useEffect` for `model.secondaryEditor` write (moves to `model.setSidebarPanels` via cleaner view useEffect), drops the portal-based toolbar+footer (relocated to `LinkToolbarBits` + `LinkFooterBits` inside `LinkEditorView.tsx` per walkthrough 09 / 10).
  - `panels/LinkCategorySecondaryEditor.tsx`:
    - `useContentViewModel<LinkViewModel>` → direct prop typing `model: LinkEditor`.
    - Today's lines 37-52 (duck-typed `m.treeProvider = vm.treeProvider` block) **delete entirely** — LinkEditor exposes `treeProvider` / `selectByHref` / `selectionState` directly per LK9.
    - Today's lines 57-71 (`updatePanels` useEffect that watches `vm.state.tags.length`) **delete entirely** — LinkEditor's `onMainEditorChanged` + a tags-slice subscription handle this model-side per LK8.
    - Header content (Save button when modified + Swap button) preserved verbatim; the `handleToggleMainEditor` callback continues to call `model.page?.promoteSecondaryToMain(model)`.
  - `panels/LinkTagsSecondaryEditor.tsx` — flip from VM-wrap to EditorModel-wrap; `LinkTagsNavigationPanel` carries over verbatim.
  - `panels/LinkHostnamesSecondaryEditor.tsx` — flip from VM-wrap to EditorModel-wrap.
  - `panels/LinkCategoryPanel.tsx`, `panels/LinkTagsPanel.tsx`, `panels/LinkHostnamesPanel.tsx` — `vm: LinkViewModel` prop renames to `model: LinkEditor`; method calls preserved verbatim (`vm.setSelectedCategory(...)` → `model.setSelectedCategory(...)`).
  - `LinkTreeProvider.ts` — constructor `vm: LinkViewModel` arg renames to `editor: LinkEditor`; all `this.vm.state.get()...` reads become `this.editor.state.get()...`.
  - `LinksList.tsx`, `LinksTiles.tsx`, `LinkItemList.tsx`, `LinkItemTiles.tsx`, `PinnedLinksPanel.tsx`, `EditLinkDialog.tsx`, `LinkTooltip.tsx` — `model: LinkViewModel` prop type renames to `model: LinkEditor`; method calls preserved.
  - `linkTypes.ts`, `linkTraits.ts` — verbatim.

- **Deleted files**:
  - `LinkViewModel.ts` (the file).

- **Edited files**:
  - `src/renderer/editors/register-editors.ts` — link-view registration swaps from VM-based to EditorModel-based: `() => new LinkEditor(state)`. Drops `acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent` quartet in favor of single `accepts()` per LK10.
  - `src/renderer/editors/registry.ts` — `LinkEditor.accepts` predicate landed per LK10 sketch.
  - `src/renderer/scripting/api-wrapper/LinkEditorFacade.ts` — constructor accepts `LinkEditor` (was `LinkViewModel`); method bodies preserved (`this.vm.X` → `this.editor.X`). `page.asLink(force?)` adds the SF1 force parameter.
  - `src/renderer/components/category-editor/CategoryEditor.tsx` (or wherever `findTreeProviderHost` lives) — replaces `(editor as any).treeProvider` reads with typed `editor instanceof LinkEditor ? editor.treeProvider : …` chain. Same change at `findTreeProviderHost`'s call site within Explorer and Archive editor migrations (walkthrough 30).
  - `src/renderer/api/pages/PageModel.ts` — `promoteSecondaryToMain` method preserved (today's API); unchanged surface.
  - `src/renderer/api/types/link-editor.d.ts` (new) — declaration file for the script-API surface (`page.asLink(force?): LinkEditorFacade`); same shape as other text-bearing editor declarations.

- **Persistence migration**: zero per C2 + P2. Today's `<host.id>-link-editor.txt` cache files (per-collection selection state) get collected by per-editor `fs.deleteCacheFiles(editor.id)` on future dispose; orphans linger harmlessly per P9.

- **Touch on shared components**: none. `TreeProviderView`, `CollapsiblePanelStack`, `Splitter`, `Breadcrumb`, `HighlightedTextProvider`, `RenderGrid` etc. all carry over verbatim.

---

## Closure

All ten concerns RESOLVED 2026-05-20. **Zero mockup changes.**

Final outcomes by concern:

| # | Resolution | Mockup change |
|---|------------|---------------|
| LK1 | (a) — `LinkEditor` IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT (sixth Tier 5 editor in uniform shape) | none |
| LK2 | (a) — 5 persisted (`leftPanelWidth` + `expandedPanel` + `selectedCategory`/`Tag`/`Hostname`) / 11 ride-state stripped / 8 private | none |
| LK3 | (a) — fold selection-state cache into `EditorDescriptor.state` (third instance: Grid GR4 → Log View LV3 → Link LK3) | none |
| LK4 | (a) — three-site lifecycle split: `restore()` initial parse + `adoptHost` content subscription + `dispose()` flush | none |
| LK5 | (a) — keep `skipNextContentUpdate` editor-private flag (second instance: Log View LV6 → Link LK5) | none |
| LK6 | (a) — `setSidebarPanels(open)` model method called by view's useEffect; gated on `mainEditor === model` for demote-safe no-op | none |
| LK7 | (a) — override `beforeNavigateAway` with `contributesPanels()` discriminator; retires today's view-side cleanup-function early-return | none (B1 deferred) |
| LK8 | (a) — override `onMainEditorChanged` to adjust panel list to standalone-secondary shape; retires today's `LinkCategorySecondaryEditor.updatePanels` useEffect | none |
| LK9 | (a) — typed accessors on LinkEditor (`treeProvider`, `selectByHref`, `selectionState`); three `(m as any)` casts retire | none |
| LK10 | (a) — filename `.link.json` priority 70 + content-peek priority 60; queue events `{ focus }` only; request `never` | none |

**Tier 5 template confirmed on the first sidebar-owning editor — the most topologically-different shape yet.** Walkthroughs 20 / 21 / 22 / 23 set the template on complex (Monaco) → medium (Grid) → light (Preview) → append-only (LogView) editors; this walkthrough confirms it carries cleanly on a **sidebar-owning editor with three render modes and two lifecycle-hook overrides** — even broader axis coverage than walkthrough 23 anticipated. The two existing lifecycle hooks (`beforeNavigateAway` + `onMainEditorChanged`) — present in the mockup since walkthrough 03 for exactly this purpose — fit alongside the override list without base-class machinery growth.

**Cross-walkthrough cleanups landed by this walkthrough:**

- **LK3** — third instance of "per-editor cache file → descriptor.state" consolidation (Grid GR4 → Log View LV3 → Link LK3). Pattern is now standardized: any text-bearing editor with per-window UI state folds that slice into `EditorDescriptor.state`.
- **LK5** — second instance of "self-write guard" pattern (Log View LV6 → Link LK5). Pattern is now standardized: any mutate-then-serialize editor that writes back to its host via `host.changeContent` carries an editor-private `skipNextContentUpdate` flag.
- **LK7** — **first text-bearing-editor exercise of `beforeNavigateAway` override.** Archive's S8 sourceLink-based pattern set the precedent for no-host editors; LinkEditor's `contributesPanels()`-based pattern establishes the current-state discriminator shape. The hook now has two valid discriminator shapes documented by example.
- **LK8** — **first text-bearing-editor exercise of `onMainEditorChanged` override.** Pattern: "respond to demote with a render-mode adjustment" — adjust the panel list to standalone-secondary shape on demote.
- **LK9** — three duck-typed model-attached fields (`treeProvider`, `selectionState`, `selectByHref`) become typed class members on LinkEditor; same flip at the read site (`findTreeProviderHost`) drops three `any` casts across writer + reader.

**Implementation notes carried forward:**

- The Tier 5 class repetition count grows to **six editors** with the same ~80-LOC skeleton (Monaco / Grid / Markdown / Mermaid / LogView / Link all carry an identical CONTENT_HOST_TRAIT closure + adoptHost + switchFrom + restore + dispose shape). PV1's "re-evaluate after walkthroughs 23–29" recommendation continues to apply — one more data point in the "common surface might be extractable" direction, but the actual call still belongs after all text-bearing editors land.
- LinkEditor's class name finalizes as `LinkEditor` (matching the rest of the Tier 5 naming convention: MonacoEditor, GridEditor, MarkdownEditor, LogViewEditor). Today's `LinkEditor.tsx` React component file renames to `LinkBody.tsx` per the Tier 5 template (consistent with `MarkdownBody.tsx`, `GridBody.tsx`, `LogBody.tsx`).
- The view-side `useEffect` cleanup-function early-return in today's `LinkEditor.tsx:144-152` ("demote survives" hack) **disappears entirely** — the cleanup branch was only needed because the view was responsible for writing `secondaryEditor`; once `beforeNavigateAway` keeps the panels alive model-side, the view's cleanup can run a clean `model.setSidebarPanels(false)` without affecting the demote path (gated on `mainEditor === model` per LK6).
- The duck-typed block in today's `LinkCategorySecondaryEditor.tsx:37-52` (writing `m.treeProvider = vm.treeProvider` etc. onto the model via `(m as any)`) **disappears entirely** — three `any` casts retire across writer + reader sites. Pattern sets the precedent for future TreeProvider sources (Archive + Explorer in walkthrough 30): each exposes its own typed accessors on its class; the `findTreeProviderHost` consumer grows an `instanceof` chain by one entry per source.
- **First demonstration that EPIC-028's `beforeNavigateAway` + `onMainEditorChanged` hooks compose cleanly** — LK7 (preserve panels on navigate-away) and LK8 (adjust panel set after demote) work in sequence: `beforeNavigateAway` keeps `secondaryEditor` non-empty → visibility criterion keeps the editor in `editors[]` → page sets new main → `onMainEditorChanged` fires on demoted editor → it re-shapes its panel list. Two-hook sequence is the canonical "demote-and-re-shape" recipe for any future sidebar-owning editor (Todo walkthrough 25, Rest Client walkthrough 26 may follow).

**Walkthrough 25 (Todo) is next** — second sidebar-owning editor in Tier 5; follows the LK7 + LK8 + LK9 template laid down here for `beforeNavigateAway` / `onMainEditorChanged` / TreeProvider integration; first opportunity to confirm the recipe carries across a second sidebar-owner.
