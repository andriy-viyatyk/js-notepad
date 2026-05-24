# US-557: Notebook editor migration (EPIC-028 Phase C)

> **Status:** Investigation complete 2026-05-24, **ready for implementation** (outer-only scope confirmed by user 2026-05-24).
> **Walkthrough:** [`doc/epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md) (NB1–NB10 RESOLVED in design 2026-05-20; HS1 amendment to NB3 landed 2026-05-21).
> **Risk profile:** Highest of all Tier-5 editors. **Tenth Tier-5 text-bearing editor** (after Monaco / Grid / LogView / Markdown / Svg / Html / Mermaid / Graph / Draw / Link / Todo / RestClient). Structurally distinctive — owns TWO `IContentHost` implementations simultaneously: `TextFileModel` (page-level) AND `NoteItemEditModel` (per-note). Touches drag-trait systems (Note + NotebookCategory + LINK), nested editor dispatch via `NoteItemActiveEditor` → `AsyncEditor`, per-note `data.state[id]` arbitrary-key storage, and the ExpandedNoteView overlay portal.

---

## Goal

Migrate the **outer Notebook editor** (`.note.json` files) from the legacy `NotebookViewModel` + `LegacyEditorAdapter` pair to a native v4 `NotebookEditor` class with `TextFileModel` as its `IContentHost`. **Tenth Tier-5 editor** in the uniform "EditorModel IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT" shape. Retires the bare-adapter mirror for `notebook-view` (last entry in `TEXT_CONTENT_VIEW_BRIDGE_IDS`). Folds 4 outer UI fields (`leftPanelWidth`, `expandedPanel`, `selectedCategory`, `selectedTag`) into HS1 host slot — **seventh instance** of the cache-file → HS1 pattern. Preserves the legacy `NotebookViewModel` + today's React view for parallel-track legacy/v4 coexistence (matches every prior Tier-5 task; safer rollback; retires alongside `LegacyEditorAdapter` in US-559).

**Scope explicitly excludes** the inner per-note dispatch migration (per NB-IMPL1 — confirmed outer-only 2026-05-24). The `NoteItemEditModel`, `NoteItemActiveEditor`, `MiniTextEditor`, `NoteItemToolbar`, `ContentViewModelHost`, and the per-note `acquireViewModel(editorId)` machinery stay alive verbatim. Inner per-note migration moves to [US-579 — Notebook inner per-note migration](../US-579-notebook-inner-per-note-migration/README.md), positioned in EPIC-028 Phase D before US-559.

---

## Background

### Today's surface

`src/renderer/editors/notebook/` — 14 files in two groups:

| Group | Files | LOC |
|-------|-------|-----|
| Outer (page-level) | `NotebookViewModel.ts`, `NotebookEditor.tsx`, `notebookTypes.ts`, `index.ts` | ~1100 |
| Outer view machinery | `NoteItemView.tsx`, `NoteItemViewModel.ts`, `ExpandedNoteView.tsx`, `TagsListView.tsx`, `category-tree.tsx` | ~1200 |
| Inner per-note (untouched) | `note-editor/NoteItemEditModel.ts`, `note-editor/NoteItemActiveEditor.tsx`, `note-editor/NoteItemToolbar.tsx`, `note-editor/MiniTextEditor.tsx`, `note-editor/index.ts` | ~650 |

### Today's `NotebookViewModel` state (13 fields)

```typescript
const defaultNotebookViewState = {
    data: { notes: [], state: {} } as NotebookData,
    error: undefined as string | undefined,
    leftPanelWidth: 200,
    expandedPanel: "categories" as ExpandedPanel,        // "tags" | "categories"
    categories: [] as string[],                           // derived from notes
    categoriesSize: {} as { [key: string]: number },      // derived counts
    tags: [] as string[],                                 // derived from notes
    tagsSize: {} as { [key: string]: number },            // derived counts
    selectedCategory: "" as string,                       // "" = "All"
    selectedTag: "" as string,                            // "" = no tag filter
    searchText: "" as string,                             // session-only
    filteredNotes: [] as NoteItem[],                      // derived view
    expandedNoteId: "" as string,                         // overlay state
};
```

Plus **3 private fields**: `lastSerializedData`, `skipNextContentUpdate`, `lastFilterState`.

### Today's `NotebookData` shape (root of `.note.json`)

```typescript
interface NotebookData {
    notes: NoteItem[];
    state: Record<string, NoteItemState>;                 // per-note arbitrary state
}

interface NoteItem {
    id: string;
    title: string;
    category: string;
    tags: string[];
    content: NoteContent;                                  // language + content + editor (preferred view)
    comment?: string;
    createdDate: string;
    updatedDate: string;
}

interface NoteItemState {
    contentHeight?: number;                                // measured editor height
    [key: string]: unknown;                                // arbitrary editor-specific state
}
```

**Two load-bearing properties:**
1. `data.state[noteId]` arbitrary-key map carries per-note editor state (Grid column widths, etc.) **inside the notebook JSON file**. NoteItemEditModel.stateStorage forwards via `NotebookViewModel.{get,set}NoteState`. Survives cross-window transfer and cross-machine sync (the JSON moves whole).
2. `note.content.editor` is the preferred per-note editor id (e.g., `"monaco"`, `"grid-json"`, `"markdown-view"`). Persists across restart inside the JSON. The user can switch a note's view via `NoteItemEditModel.changeEditor` which writes back via `NotebookViewModel.updateNoteEditor`.

### JSON self-write pattern today

Same shape as LogView (LV6), Link (LK5), Todo (TD5), Rest Client (RC5). State mutation → `onDataChangedDebounced` (300ms) → JSON serialize → `host.changeContent(content, true)` → `onContentChanged(content)` re-parse guarded by `skipNextContentUpdate` self-write flag.

### Today's two `IContentHost` implementations

1. **`TextFileModel`** — wraps the `.note.json` file on disk. Outer NotebookEditor adopts this as its v4 IContentHost.
2. **`NoteItemEditModel`** (today) — implements the **LEGACY** `IContentHost` interface (`acquireViewModel` / `acquireViewModelSync` / `prepareViewModel` / `releaseViewModel` + `_vmHost: ContentViewModelHost`). Lifetime tied to React mount via `NoteItemViewModel.dispose`. Forwards content / language / editor changes back to `NotebookViewModel`.

Under v4 outer-only scope (NB-IMPL1 recommendation): NoteItemEditModel keeps the legacy interface verbatim and continues to feed `NoteItemActiveEditor` → `AsyncEditor` → legacy `XxxView` / `XxxViewModel` pairs (all preserved by US-554/US-555/US-556/US-560/US-561/US-562/US-563/US-564/US-565 retrospective patterns).

### Today's `NotebookEditor.tsx` (React view, ~315 LOC)

Today's view consumes the VM via:

```typescript
const vm = useContentViewModel<NotebookViewModel>(model, "notebook-view");
const pageState = useSyncExternalStore(
    vm ? (cb) => vm.state.subscribe(cb) : noopUnsubscribe,
    vm ? () => vm.state.get() : getDefaultState,
);
```

Portals into four host targets:
- **Toolbar first** (`model.editorToolbarRefFirst`) — `<Breadcrumb>` for categories or tags (depending on `expandedPanel`).
- **Toolbar last** (`model.editorToolbarRefLast`) — `<AddNoteButton>` + `<SearchInput>` (+ clear).
- **Footer last** (`model.editorFooterRefLast`) — `"<count> notes"` or `"<filtered> of <total> notes"`.
- **Overlay** (`model.editorOverlayRef`) — `<ExpandedNoteView>` when `expandedNoteId` is set.

Body composes (no portal): `<CollapsiblePanelStack>` (left, tags / categories) + `<Splitter>` + `<RenderFlexGrid>` of `<NoteItemView>` cells.

### Today's drag-and-drop traits — three active systems

Today's NotebookEditor.tsx and NotebookViewModel.ts operate three drag trait systems simultaneously:

1. **`TraitTypeId.Note`** (emit) — each `NoteItemView` emits a Note drag payload for cross-category drag (drop a note onto a category in the tree → assigns category).
2. **`TraitTypeId.NotebookCategory`** (emit + accept) — categories in the left tree can be dragged onto other categories to nest them (`moveCategory` flow with `ui.confirm`).
3. **`LINK` trait** (accept) — categories accept LINK drops from PageNavigator (creates a new note from the link).

**Richest trait consumer in the Tier-5 set** — three active trait types vs. Link/RestClient's two. Verbatim port; drag traits stay orthogonal to EditorModel traits.

### Today's registration (`register-editors.ts:???`)

Standard quartet (`acceptFile` / `validForLanguage` / `switchOption` / `isEditorContent`) — `.note.json` extension + content-peek for `"type": "note-editor"` + `"notes"`. Plus `"notebook-view"` is the **last surviving entry** in `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 782) — the mirror loop ships a bare-adapter v4 stub.

### `wrapLegacyForPage` callers that hit notebook-view today

1. **`openFile(filePath)`** for any `.note.json` file — registry resolves to `notebook-view`.
2. **`openFile(filePath)` with content-peek** — any `.json` file whose content includes `"type":"note-editor"` matches `isEditorContent` predicate.
3. **Sidebar "Notebook" tool button** — `tools-editors-registry.ts` (verbatim mirror of Todo / Link tool buttons; verify during implementation).
4. **`addEditorPage("notebook-view", "json", title, content)`** — possible `App` / scripting consumers; grep needed during implementation (today's grep of `addEditorPage.*"notebook-view"` returns zero hits — verify).

All currently fall through to `LegacyEditorAdapter` in `wrapLegacyForPage`. Under US-557 we add a `notebook-view` branch that constructs a `NotebookEditor` over the TextFileModel host — mirror of the existing `rest-client` (PagesLifecycleModel.ts:240) / `todo-view` (line 221) branches.

### Today's `acquireViewModel("notebook-view")` consumers

The OUTER notebook view model is acquired through `useContentViewModel<NotebookViewModel>(model, "notebook-view")` in `NotebookEditor.tsx:36`. Grep shows **no other callers** outside this file — no `acquireViewModelSync("notebook-view")`, no `loadViewModelFactory("notebook-view")` pre-loads, no scripting facade. Under v4 outer migration, this callsite goes through the legacy `NotebookEditor.tsx` (= `NotebookView.tsx` after NB-IMPL7 rename) only when the legacy path is invoked — but under outer-only migration, the legacy path is never invoked for `notebook-view` pages (they all hit the v4 branch).

### HS1 — `host.editorSettings["notebook-view"]` slot (US-552-B contract; NB3 amendment)

`IContentHost.getEditorState<T>(editorId)` / `setEditorState<T>(editorId, value)` shipped under US-552-B (TextEditorModel.ts:306-318). The 4 persisted fields per NB3 amendment ride the host slot:

```typescript
interface NotebookViewSettings {
    leftPanelWidth?: number;
    expandedPanel?: "tags" | "categories";
    selectedCategory?: string;
    selectedTag?: string;
}
```

The slot is seeded into editor state inside `adoptHost`; a slice-subscribe mirror writes back on changes. **Incidental fix:** today's NotebookViewModel does NOT persist these 4 fields anywhere — they reset to defaults on every notebook open. Folding into host slot adds persistence (silent today-bug — **fifth instance** of this incidental fix after LK2 / TD2 / RC2 / Markdown).

### Override count: 9 hooks (matches Todo / Rest Client)

Non-sidebar-owning Tier-5 editor — NotebookEditor does NOT register secondary panels. The left tags/categories panels render inline inside the editor body via `<CollapsiblePanelStack>`, not as `secondary-editor-registry` entries. No `beforeNavigateAway` (NB-equivalent of RC6 / TD6); no `onMainEditorChanged`.

---

## Concerns

### Concerns inherited from walkthrough (NB1–NB10 RESOLVED)

| # | Topic | Resolution |
|---|-------|-----------|
| NB1 | Class topology | NotebookEditor IS mainEditor + TextFileModel host with `CONTENT_HOST_TRAIT`. **Tenth Tier-5 editor** in uniform shape. |
| NB2 | State slice partitioning | 4 HS1 persisted / 8 ride-state stripped / 1 transient. `expandedNoteId` rides state for reactivity but strips on save (overlay; resets to "" on restart). `searchText` transient (same shape as TD2 / RC2). Silent today-bug for `leftPanelWidth`/`expandedPanel`/`selectedCategory`/`selectedTag` incidentally fixed — **fifth instance** (LK2 → TD2 → RC2 → Markdown → NB2). |
| NB3 | Selection cache → HS1 | New persistence ADDED via host slot. **Seventh instance** of "cache-file → HS1" (GR4 → LV3 → LK3 → DR4/MR5 → TD3 → RC3 → NB3). Pattern now standardized across **seven of ten** Tier-5 editors. |
| NB4 | Three-site lifecycle split | Today's `onInit` (5 statements) splits into `restore()` + `adoptHost()` + `dispose()`. **Sixth Tier-5 editor** in this lifecycle shape (LV4 → LK4 → TD4 → RC4 → NB4). |
| NB5 | Self-write-guard pattern | Keep `skipNextContentUpdate` editor-private flag — **sixth instance** of self-write-guard pattern (LV6 → LK5 → GR7/DR7 → TD5 → RC5 → NB5). Pattern fully solidified. |
| NB6 | NoteItemEditModel decomposition | **AMENDED — see NB-IMPL1 below.** Walkthrough proposed full decomposition (delete `_vmHost`, delete `acquireViewModel*`, delete `ContentViewModelHost.ts` entirely). Under outer-only recommendation: **defer NB6 to a follow-up task** (no changes to inner per-note dispatch under US-557). |
| NB7 | Per-note embedded EditorModel + switch widget | **AMENDED — see NB-IMPL1 below.** Walkthrough proposed per-note three-phase switch via `EditorConstructorArgs.initialHost`. Under outer-only recommendation: **defer NB7 to a follow-up task**. Today's per-note dispatch (NoteItemActiveEditor + legacy XxxView via AsyncEditor) stays verbatim. |
| NB8 | Per-note state backing | Preserve verbatim. `notebook.data.state[id]` arbitrary-key map stays inside the notebook JSON file. **Equally applicable** to outer-only and full-scope paths. |
| NB9 | Drag-and-drop traits | Preserve all three trait systems verbatim (Note + NotebookCategory + LINK). Same as TD9 / RC9. Notebook is the richest trait consumer in the Tier-5 set — three trait types. |
| NB10 | Registration + queue + scripting facade | `accepts({host, fileName, language})` predicate: filename `.note.json` priority 70 + content-peek priority 60. Queue events: `{ type: "focus" }` only. **Defer scripting facade** — Notebook joins Rest Client (RC10) as the **second** text-bearing Tier-5 editor without a `XxxEditorFacade.ts`. The Tier-5 template doesn't require a facade; adding one later is mechanical (4 file touches). |

---

### NB-IMPL1 — SCOPE: Outer-only migration vs. full walkthrough scope ✅ RESOLVED 2026-05-24

**Decision: outer-only.** Inner per-note migration deferred to [US-579](../US-579-notebook-inner-per-note-migration/README.md), positioned in EPIC-028 Phase D before US-559.

**Original analysis (kept for reference):** This was the load-bearing decision for US-557 — whether the inner per-note dispatch system migrates alongside the outer NotebookEditor or stays alive.

**Walkthrough as written (full scope):**
- NotebookEditor v4 (outer) — straightforward Tier-5 migration.
- NoteItemEditModel becomes a v4 IContentHost (slim, ~70 LOC down from ~375). Implements `getEditorState`/`setEditorState`/`setStorage`/`dispose`/`getDescriptor`.
- `ContentViewModelHost.ts` deletes entirely from the codebase. Last consumer dissolves.
- `_vmHost: ContentViewModelHost` field on NoteItemEditModel — deleted.
- `acquireViewModel` / `acquireViewModelSync` / `prepareViewModel` / `releaseViewModel` methods — all deleted.
- `editor: NoteEditorModel` field (Monaco-specific sub-class) — deleted; relocates into embedded MonacoEditor.
- Portal refs (`editorToolbarRefFirst/Last`, `editorFooterRefLast`) — deleted (per C8).
- Compatibility props (`noLanguage`, `getIcon`, `filePath`, `title`, `encrypted`, `decrypted`) — deleted (use `instanceof` per C1).
- Each note's nested editor becomes a v4 `EditorModel` instance constructed via `editorRegistry.getEditorModelFactory(editorId)` + `initialHost: noteItemEditModel`.
- Per-note switch widget invokes the three-phase switch protocol at the NoteItemViewModel level (vs. PageModel level today).

**Outer-only (recommended):**
- NotebookEditor v4 (outer) — straightforward Tier-5 migration. Same as full scope.
- **NoteItemEditModel, NoteItemActiveEditor, MiniTextEditor, NoteItemToolbar, NoteEditorModel (sub-class)** — all stay verbatim.
- `ContentViewModelHost.ts` stays alive (NoteItemEditModel still imports it).
- Inner per-note dispatch continues to call legacy `editorRegistry.getById(editor).loadModule()` → renders `<EditorModule.Editor model={noteItemEditModel}>` via `AsyncEditor`. This is the path **explicitly preserved** by the retrospective patterns of every prior Tier-5 task (LV/LK/TD/RC/GR/DR/MK/SV/HT/MR all preserved their legacy view + VM for "future notebook-embed").

**Why outer-only is the right call:**

1. **The walkthrough understates inner-migration cost.** Each Tier-5 editor's `_host: TextFileModel | null` and `adoptHost(host: TextFileModel)` is typed against TextFileModel specifically, not the v4 IContentHost interface. Widening to `IContentHost` requires auditing each editor for TextFileModel-only method calls (`host.io.saveState`, `host.script`, `host.runScript`, `host.confirmRelease`, `host.setPage`, `host.setEditorOverlayRef`, `host.setEditorToolbarRefFirst`, etc.) and either no-op'ing them in the per-note path or implementing equivalents on NoteItemEditModel. That's an 11-editor audit/refactor sweep.
2. **The Tier-5 modules' `Component` is `<TextChrome>` + `<XxxBody>` — not suitable for embedded use.** Embedded editors render WITHOUT TextChrome (notebook itself owns the chrome). The `EditorModule` interface would need a new `Body?: React.ComponentType<{model}>` slot, and each of the 11 v4 modules would need to export a Body that works against a per-note context (no portal refs, no script panel, no encoding label).
3. **The retrospective preservation pattern was DESIGNED for this exact moment.** Every prior task (US-554 onward) explicitly preserves the legacy `XxxView` + `XxxViewModel` for "future notebook-embed parity." Under outer-only, those preserved consumers **finally activate** — the inner per-note dispatch goes through them.
4. **Outer-only is the minimum viable strangler-fig step.** It brings NotebookEditor into v4 (CONTENT_HOST_TRAIT, descriptor persistence, HS1 host slot, three-site lifecycle, JSON self-write loop) while leaving the inner system on the legacy track. The inner migration then becomes a self-contained follow-up task.
5. **No silent regressions.** Outer-only changes zero behavior in nested note editing — Grid columns persist via the same `data.state[id][name]` mechanism, Monaco loads via the same `MiniTextEditor`, switching a note's view via the same `NoteItemToolbar` → `NoteItemEditModel.changeEditor`. Only the OUTER notebook persistence and lifecycle change.

**Cost of outer-only:** `ContentViewModelHost.ts` (~135 LOC) stays alive until the follow-up. NoteItemEditModel keeps its `_vmHost` + 4 `acquireViewModel*` methods. The walkthrough's promised "ContentViewModelHost.ts deletes entirely" gets DEFERRED, not cancelled.

**Recommendation:** **Outer-only.** Create a follow-up task (proposed `US-579 — Notebook inner per-note migration`) for the NB6/NB7 work, scope it after US-557 ships and stabilizes. **OR** roll the inner migration into US-559 (strangler-fig retirement) since `ContentViewModelHost` + `acquireViewModelSync` + the entire legacy content-view subsystem all retire together at the EPIC-028 close.

> **✅ USER CONFIRMED 2026-05-24:** Outer-only scope. US-579 created for the deferred inner per-note migration; placed before US-559 on the dashboard.

---

### NB-IMPL2 — File naming under preserved-legacy-view contract

**Walkthrough deviation:** Walkthrough §Migration scope §Renamed files says today's `NotebookEditor.tsx` renames to `NotebookBody.tsx`; `NotebookViewModel.ts` deletes. This contradicts the US-554/US-555/US-556/US-560/US-561/US-562/US-563/US-564/US-565 retrospective preservation pattern.

**Resolution:** Rename today's `NotebookEditor.tsx` → `NotebookView.tsx` (file rename only via `git mv`; exported function name `NotebookEditor` UNCHANGED). Preserve `NotebookViewModel.ts` byte-for-byte. Frees the `NotebookEditor` name for the new v4 class file `NotebookEditor.ts`.

**Rationale:**
- Aligns with the preserved-sibling pattern (`GraphView.tsx`, `DrawView.tsx`, `MermaidView.tsx`, `HtmlView.tsx`, `SvgView.tsx`, `MarkdownView.tsx`, `LinkView.tsx`, `TodoView.tsx`, `RestClientView.tsx`).
- Allows the legacy `editorRegistry.register({id:"notebook-view", loadModule:…})` block to keep returning `{Editor: module.NotebookEditor, createViewModel: createNotebookViewModel}` for the LegacyEditorAdapter path (which is still used as a safety net — see NB-IMPL3).
- Safer rollback if the v4 implementation needs a quick revert during testing.
- Consistent code organization with the 9 prior Tier-5 editors.

**Note:** Unlike other preserved-VM editors (which were preserved for future-notebook-embed), Notebook itself isn't embeddable inside a notebook. The preservation rationale is instead: rollback safety + pattern consistency + retirement-with-LegacyEditorAdapter in US-559.

New v4 files: `NotebookEditor.ts` (class), `NotebookBody.tsx` (v4 view body — composes the splitter+grid layout), `index.tsx` (module wrapper with TextChrome).

### NB-IMPL3 — `NotebookSource` union type for `NoteItemView` props

Today's `NoteItemView` props (NoteItemViewProps in NoteItemViewModel.ts:12) require `notebookModel: NotebookViewModel`. Under v4 outer-only migration, the v4 `NotebookBody.tsx` needs to render `<NoteItemView notebookModel={editor}>` where `editor: NotebookEditor`.

**Resolution:** Add a `NotebookSource = NotebookViewModel | NotebookEditor` union alias in `notebookTypes.ts`. Widen `NoteItemView`'s prop type to accept either. The 14 methods consumed by NoteItemView/NoteItemViewModel/NoteItemEditModel — `getNoteState`, `setNoteState`, `getNoteHeight`, `setNoteHeight`, `updateNoteContent`, `updateNoteLanguage`, `updateNoteEditor`, `pageModel` (getter), `deleteNote`, `expandNote`, `addComment`, `updateNoteComment`, `removeComment`, `updateNoteTitle`, `updateNoteCategory`, `addNoteTag`, `removeNoteTag`, `updateNoteTag` — all have identical signatures on both classes. TS union narrowing handles dual-source naturally without an explicit interface. **Eighth instance** of the dual-source pattern (LK13 → TD13 → RC13 → NB-IMPL3 retrospective).

**Prop name discussion:** Today's `NoteItemView` uses `notebookModel` as the prop name. Keep `notebookModel` (don't rename to `notebook` or `editor`) — minimal diff; matches the precedent (RC13 kept `vm` as the prop name).

### NB-IMPL4 — `NoteItemEditModel.notebookModel` field type

Today's NoteItemEditModel constructor: `constructor(notebookModel: NotebookViewModel, note: NoteItem)`. The `_editModel` is instantiated by NoteItemViewModel.editModel getter from `this.props.notebookModel`.

**Resolution:** Widen NoteItemEditModel's constructor + field type to `NotebookSource`. The methods NoteItemEditModel calls on `notebookModel` (`updateNoteContent`, `updateNoteEditor`, `updateNoteLanguage`, `getNoteState`, `setNoteState`, `getNoteHeight`, `setNoteHeight`, `pageModel`) all exist on both classes. Three-line typing widening; zero logic change.

### NB-IMPL5 — `pageModel` getter on NotebookEditor

Today's `NotebookViewModel.pageModel` (line 95-97):
```typescript
get pageModel(): TextFileModel {
    return this.host as unknown as TextFileModel;
}
```

Used by NoteItemEditModel.runScript to forward script execution against the notebook's underlying page (so `page.content` resolves to the notebook JSON, not the note's content).

**Resolution:** Add equivalent getter on NotebookEditor:
```typescript
get pageModel(): TextFileModel {
    if (!this._host) throw new Error("NotebookEditor: pageModel accessed before adoptHost");
    return this._host;
}
```

### NB-IMPL6 — `wrapLegacyForPage` `notebook-view` branch

Mirror of `rest-client` (PagesLifecycleModel.ts:240-249) and `todo-view` (line 221-230) branches. Add at the bottom of the editor-specific branches, BEFORE the `LegacyEditorAdapter` fallback:

```typescript
// EPIC-028 / US-557 — Notebook migrated to native v4 module. Construct
// NotebookEditor over the legacy TextFileModel host. The initial loadData()
// call kicks off inline (mirrors today's NotebookViewModel.onInit → loadData
// behavior). Non-sidebar-owning Tier-5 editor — no panel registration here.
// Inner per-note dispatch (NoteItemEditModel + acquireViewModel) stays on
// the legacy content-view path per US-557 outer-only scope (NB-IMPL1).
if (isTextFile && targetEditorId === "notebook-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const notebook = new NotebookEditor(
        new TComponentState({ ...defaultNotebookEditorState, id }),
    );
    notebook.adoptHost(legacy as TextFileModel);
    const content = (legacy as TextFileModel).state.get().content ?? "";
    notebook.loadData(content);
    return notebook;
}
```

Plus the top-of-file import:
```typescript
import { NotebookEditor, defaultNotebookEditorState } from "../../editors/notebook";
```

### NB-IMPL7 — Registry mirror loop cleanup + native v4 register

Remove `"notebook-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (register-editors.ts:782 — the LAST surviving entry). Replace with a comment matching the pattern of the others. After removal, `TEXT_CONTENT_VIEW_BRIDGE_IDS` is empty, but the loop and stub component can stay (defensive — could be deleted entirely if confirmed unused; minor cleanup).

Add a native v4 register block at the bottom of `register-editors.ts` (mirror of US-563's rest-client block at lines 1183-1210):

```typescript
// US-557 — replace the legacy bare-adapter mirror for notebook-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
// to avoid duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "notebook-view",
    name: "Notebook",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("notebook-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        // Content-peek fallback (NB10) — for `.json` files without the
        // `.note.json` extension but with notebook-shaped content.
        if (input.language === "json" && input.host) {
            const content = (input.host.state.get() as { content?: string }).content ?? "";
            if (legacy.isEditorContent?.(input.language, content)) return 60;
        }
        return -1;
    },
    loadModule: async () => {
        const { notebookModule } = await import("./notebook");
        return notebookModule;
    },
});
```

The legacy `editorRegistry.register({ id: "notebook-view", … })` block stays alive with its `loadModule` updated to import `./notebook/NotebookView` (was `./notebook/NotebookEditor`).

### NB-IMPL8 — TextChrome contributions for outer notebook chrome

Today's NotebookEditor.tsx portals four targets (toolbar first/last, footer last, overlay). Under v4 NotebookEditor with TextChrome:

| Today's portal target | v4 destination |
|------------------------|----------------|
| `model.editorToolbarRefFirst` (Breadcrumb) | `TextChrome` `toolbarContributions` slot |
| `model.editorToolbarRefLast` (Add Note + Search) | `TextChrome` `rightToolbarContributions` slot |
| `model.editorFooterRefLast` (Notes count) | `TextChrome` `footerContributions` slot |
| `model.editorOverlayRef` (ExpandedNoteView) | Unchanged — TextFileModel still owns `setEditorOverlayRef`; TextChrome renders the overlay div the same way |

Three new small components in `notebook/index.tsx`:
- `NotebookBreadcrumb({ editor })` — reads `expandedPanel`/`selectedCategory`/`selectedTag` via `editor.state.use(...)`; renders categories or tags `<Breadcrumb>`.
- `NotebookToolbarBits({ editor })` — Add Note button + Search input (with clear).
- `NotebookFooterBits({ editor })` — notes count label.
- `NotebookOverlay({ editor })` — renders `<ExpandedNoteView>` when `expandedNoteId` is set; portals into `textFileHost.editorOverlayRef`. **OR** the body renders `<ExpandedNoteView>` directly via `createPortal(...)` using `editor.host.editorOverlayRef`. Latter is closer to today; less new machinery; preferred.

### NB-IMPL9 — State slice partitioning details

13 fields total. Under refactor:

- **4 HS1 persisted** (`leftPanelWidth`, `expandedPanel`, `selectedCategory`, `selectedTag`).
- **8 ride-state stripped** from `getRestoreData`:
  - `data` — recomputed from host content via `loadData`.
  - `error` — re-derived from parse.
  - `categories` — recomputed by `loadCategories`.
  - `categoriesSize` — recomputed.
  - `tags` — recomputed by `loadTags`.
  - `tagsSize` — recomputed.
  - `filteredNotes` — recomputed by `applyFilters`.
  - `expandedNoteId` — session-only overlay; "" on restore.
- **1 transient** (`searchText`) — same shape as TD2 / RC2 (search is a session gesture; user expects no overlay on restart).
- **3 private** (`lastSerializedData`, `skipNextContentUpdate`, `lastFilterState`) — non-state; relocated as private class fields.

### NB-IMPL10 — Drag-and-drop trait machinery

Today's three trait systems all live on `NotebookViewModel` + the React view in `NotebookEditor.tsx`:

- `getCategoryDragData(item: CategoryItem)` (line 681-684) — instance method on VM.
- `canCategoryTraitDrop(target, payload)` — view-side handler (`useCallback` in NotebookEditor.tsx:108).
- `categoryTraitDrop(target, payload)` (line 638-654) — instance method on VM.

**Resolution:** Relocate all three onto `NotebookEditor` (the v4 class). View-side handlers in `NotebookBody.tsx` read from `editor.canCategoryTraitDrop` / `editor.categoryTraitDrop` / `editor.getCategoryDragData`. The view layer (`NoteItemView.tsx`) emits `TraitTypeId.Note` via `setTraitDragData` against the note id — unchanged; doesn't reach the editor at all.

### NB-IMPL11 — `accepts()` predicate calibration

```typescript
accepts({ host, fileName, language }: AcceptanceInput): number {
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

Mirrors LV10/GR10/LK10/TD10/RC10. Under outer-only, this lives on the v4 register block (NB-IMPL7) and delegates to the legacy `editorRegistry.getById("notebook-view").isEditorContent` to keep the predicate single-sourced.

### NB-IMPL12 — Module export shape (index.tsx)

`notebook/index.tsx` exports `notebookModule: EditorModule` consumed by the v4 registry. The `EditorModule.Component` wraps `NotebookBody` in `TextChrome` with the three contribution slots (NB-IMPL8). The current `notebook/index.ts` (legacy barrel — re-exports NotebookEditor / NotebookViewModel / types) — REPLACES with `notebook/index.tsx`. The new file additionally re-exports the same symbols the legacy barrel did + the new v4 `NotebookEditor` class + `defaultNotebookEditorState`.

**Important detail:** the legacy register block's `loadModule` does `await import("./notebook/NotebookEditor")` — under outer-only, this needs to update to `await import("./notebook/NotebookView")` after the file rename. The new v4 register block's `loadModule` does `await import("./notebook")` — index.tsx exports `notebookModule`.

### NB-IMPL13 — Where does `data.state[id].contentHeight` live?

Today's `getNoteHeight` / `setNoteHeight` (NotebookViewModel.ts:743-759) read/write `s.data.state[id].contentHeight`. NoteItemEditModel.persistContentHeight (line 227-229) forwards to NotebookViewModel.setNoteHeight.

**Resolution:** Relocate `getNoteHeight`/`setNoteHeight` byte-for-byte onto `NotebookEditor`. NoteItemEditModel.notebookModel field type widens to NotebookSource (NB-IMPL4), so the `notebookModel.setNoteHeight(...)` call from NoteItemEditModel.persistContentHeight binds against either implementation.

### NB-IMPL14 — Initial parse-vs-NB7 question

The walkthrough's NB7 introduces `EditorConstructorArgs.initialHost` for per-note editor construction. Under outer-only, this primitive is NOT needed for US-557 — per-note dispatch stays on the legacy `acquireViewModel` path. **The walkthrough's NB7 + `EditorConstructorArgs.initialHost` primitive does NOT land under US-557.** It lands later with the inner per-note migration follow-up.

The v4 `EditorModel` constructor today takes `(modelState, defaultState)` and creates the host inside `restore()`. `wrapLegacyForPage` already establishes the "construct then adoptHost" pattern (TodoEditor.adoptHost, RestClientEditor.adoptHost, etc.). This pattern handles US-557 without any new primitive.

### NB-IMPL15 — Possible facade omission (matches RC10)

**Defer scripting facade.** No `NotebookEditorFacade.ts`, no `api/types/notebook-editor.d.ts`, no `page.asNotebook()` accessor under US-557. **Second instance** of deferred-facade (RC10 → NB10). The Tier-5 template doesn't require a facade; adding one later is mechanical (4 file touches). Matches walkthrough §NB10 — verbatim from RC10's deferral.

### NB-IMPL16 — Verify zero `acquireViewModelSync("notebook-view")` callsites

Walkthrough 23 (LogView §LV9) claimed `acquireViewModelSync` retires at the TextFileModel interface but leaves the NoteItemEditModel.acquireViewModelSync alive until NB6. Under outer-only, NoteItemEditModel.acquireViewModelSync STAYS alive. Verify via grep that no OTHER consumer of `acquireViewModelSync("notebook-view")` exists in the codebase (today's MCP handler / ScriptContext / autoload runner / etc.) — if zero, no work needed for US-557. Confirm during implementation.

### NB-IMPL17 — `secondaryEditor` field on state

NotebookEditor is non-sidebar-owning, but the v4 `EditorStateBase` carries `secondaryEditor?: string[]` (optional). Default to `undefined`. `getRestoreData` includes it for completeness but never sets it during outer notebook lifetime. Mirrors RestClientEditor / TodoEditor.

---

## Implementation plan (outer-only scope)

### Phase 1 — Rename today's view file (NB-IMPL2)

1. Rename `src/renderer/editors/notebook/NotebookEditor.tsx` → `src/renderer/editors/notebook/NotebookView.tsx` (via `git mv` to preserve history). Exported function name `NotebookEditor` UNCHANGED.
2. Update legacy registry `loadModule` in `src/renderer/editors/register-editors.ts` (find the `notebook-view` legacy block):
   ```typescript
   loadModule: async () => {
       // EPIC-028 / US-557 — Notebook migrated to native v4 module
       // (`notebookModule` in `./notebook/index.tsx`). Legacy NotebookView +
       // NotebookViewModel are PRESERVED here for the LegacyEditorAdapter
       // safety-net path. Page-level pages take the v4 path via
       // `wrapLegacyForPage` in `PagesLifecycleModel.ts`. Inner per-note
       // dispatch (NoteItemActiveEditor → AsyncEditor → legacy XxxView)
       // still uses this path indirectly via NoteItemEditModel.acquireViewModel.
       const [module, { createNotebookViewModel }] = await Promise.all([
           import("./notebook/NotebookView"),
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
   ```
3. Verify: grep `from "./notebook/NotebookEditor"` returns ONLY the register-editors.ts entry (now updated to `NotebookView`). Grep `from "./NotebookEditor"` returns no other callers inside the notebook folder.

### Phase 2 — Add `NotebookSource` union + widen `NoteItemView` prop typing (NB-IMPL3 + NB-IMPL4)

Edit `src/renderer/editors/notebook/notebookTypes.ts`:

```typescript
// existing exports stay...

// EPIC-028 / US-557 — dual-source typing for NoteItemView + NoteItemEditModel
// during outer-only migration. Both NotebookViewModel and NotebookEditor
// expose the same setter/getter signatures consumed by NoteItemView /
// NoteItemViewModel / NoteItemEditModel.
import type { NotebookViewModel } from "./NotebookViewModel";
import type { NotebookEditor } from "./NotebookEditor";
export type NotebookSource = NotebookViewModel | NotebookEditor;
```

Edit `src/renderer/editors/notebook/NoteItemViewModel.ts`:
- Line 14: `notebookModel: NotebookViewModel` → `notebookModel: NotebookSource`.
- Line 63: `new NoteItemEditModel(this.props.notebookModel, this.props.note)` — type flows naturally.

Edit `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts`:
- Line 179: `private notebookModel: NotebookViewModel` → `private notebookModel: NotebookSource`.
- Line 197: `constructor(notebookModel: NotebookViewModel, note: NoteItem)` → `constructor(notebookModel: NotebookSource, note: NoteItem)`.
- Line 292 (`runScript`): `this.notebookModel.pageModel` — works because both classes expose `pageModel: TextFileModel` getter.

Edit `src/renderer/editors/notebook/NoteItemView.tsx`:
- Line 145-146: `useObjectStateStorage(notebookModel.getNoteState, notebookModel.setNoteState)` — works because both classes expose these methods.

No changes to method signatures or bodies in any of these files.

### Phase 3 — Create v4 `NotebookEditor.ts` (NB1 / NB2 / NB3 / NB4 / NB5 / NB-IMPL5 / NB-IMPL10 / NB-IMPL13)

Create `src/renderer/editors/notebook/NotebookEditor.ts` (~700 LOC). Mirror of `TodoEditor.ts` structure with the additional methods relocated from `NotebookViewModel`. Key shape:

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
import { splitWithSeparators } from "../../core/utils/utils";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../core/traits";
import { LINK } from "../link-editor/linkTraits";
import type { ILink } from "../../api/types/io.tree";
import type { CategoryItem } from "./category-tree";
import { NoteItem, NotebookData } from "./notebookTypes";

export type NotebookQueueEvent = { type: "focus" };
export type NotebookQueueRequest = never;
export type ExpandedPanel = "tags" | "categories";

interface NotebookViewSettings {
    leftPanelWidth?: number;
    expandedPanel?: ExpandedPanel;
    selectedCategory?: string;
    selectedTag?: string;
}

export interface NotebookEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["notebook-view"] (NB3):
    leftPanelWidth: number;
    expandedPanel: ExpandedPanel;
    selectedCategory: string;
    selectedTag: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData (NB2). Recomputed from host content via loadData /
    // loadCategories / loadTags / applyFilters.
    data: NotebookData;
    error: string | undefined;
    categories: string[];
    categoriesSize: { [key: string]: number };
    tags: string[];
    tagsSize: { [key: string]: number };
    filteredNotes: NoteItem[];
    expandedNoteId: string;
    // Transient UI state — not persisted (NB2):
    searchText: string;
}

export const defaultNotebookEditorState: NotebookEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    leftPanelWidth: 200,
    expandedPanel: "categories",
    selectedCategory: "",
    selectedTag: "",
    data: { notes: [], state: {} },
    error: undefined,
    categories: [],
    categoriesSize: {},
    tags: [],
    tagsSize: {},
    filteredNotes: [],
    expandedNoteId: "",
    searchText: "",
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class NotebookEditor extends V4EditorModel<NotebookEditorState, void, NotebookQueueEvent> {
    readonly editorId = "notebook-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _saveSubUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // NB5 — self-write guard. NB4 — ref-equality marker for serialization skip.
    private skipNextContentUpdate = false;
    private lastSerializedData: NotebookData | null = null;
    // Incremental-filter optimization (today's pattern preserved):
    private lastFilterState = { searchText: "", selectedCategory: "", selectedTag: "", expandedPanel: "" };

    // Save debounce — today's 300ms cadence preserved:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    readonly typedQueue: ComponentQueue<NotebookQueueEvent, NotebookQueueRequest>;

    constructor(state: TComponentState<NotebookEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<NotebookQueueEvent, NotebookQueueRequest>;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from NotebookEditor");
                this._tearDownHostSubscriptions();
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    private _tearDownHostSubscriptions(): void { /* mirror Todo */ }

    // ── Host accessors ──────────────────────────────────────────────────

    get host(): TextFileModel | null { return this._host; }
    get contentHost(): IContentHost | null { return (this._host as unknown as IContentHost) ?? null; }
    get pageModel(): TextFileModel {                          // NB-IMPL5
        if (!this._host) throw new Error("NotebookEditor: pageModel before adoptHost");
        return this._host;
    }
    findCompatibleEditors(): string[] { /* mirror Todo */ }
    getNavigatorTarget() { /* mirror Todo */ }
    focus(): void { this.typedQueue.send({ type: "focus" }); }

    // ── Persistence (NB2 + NB3) ─────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
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
    applyRestoreData(data: RestoreData<NotebookEditorState>): void { /* mirror Todo */ }

    // ── Three-phase lifecycle ──────────────────────────────────────────

    switchFrom(oldEditor: V4EditorModel): void { /* mirror Todo */ }
    async restore(): Promise<void> { /* mirror Todo */ }
    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();
        // Standard host-state subscription for descriptorChanged forwarding.
        // Content subscription with skipNextContentUpdate guard.
        // HS1 seed from host.getEditorState<NotebookViewSettings>("notebook-view").
        // HS1 slice-subscribe mirror writing back on changes (4 fields).
        // State subscription → onDataChangedDebounced.
        // Title / id / page propagation.
        // (Full body: ~80 LOC mirroring TodoEditor.adoptHost shape.)
    }
    setPage(page: PageModel | null): void {
        super.setPage(page);
        this._host?.setPage(page);
    }

    // ── Serialization: state → file content (NB4 + NB5) ─────────────────

    private onDataChanged = (): void => {
        const { data, error } = this.state.get();
        if (error) return;
        if (!this._host) return;
        if (data !== this.lastSerializedData) {
            this.lastSerializedData = data;
            this.skipNextContentUpdate = true;
            const content = JSON.stringify({ type: "note-editor", ...data }, null, 4);
            this._host.changeContent(content, true);
        }
    };

    // ── Data loading (NB4 — verbatim from NotebookViewModel.loadData) ────

    loadData = (content: string): void => {
        // VERBATIM relocate from NotebookViewModel.loadData lines 152-185.
        // ...
    };

    // ── Notes / Category / Tag / Search / Filter / DnD / NoteState / NoteHeight
    //     methods — ALL VERBATIM relocated from NotebookViewModel.
    //     (Combined ~600 LOC; methods unchanged byte-for-byte; field
    //     references `this.host` → `this._host`.) ─────────────────────────

    get notesCount(): number { /* VERBATIM */ }
    addNote = (): NoteItem => { /* VERBATIM */ };
    setLeftPanelWidth = (width: number) => { /* VERBATIM */ };
    setExpandedPanel = (panel: string) => { /* VERBATIM */ };
    loadCategories = () => { /* VERBATIM */ };
    categoryItemClick = (item: CategoryItem) => { /* VERBATIM */ };
    setSelectedCategory = (category: string) => { /* VERBATIM */ };
    getCategoryItemSelected = (item: CategoryItem): boolean => { /* VERBATIM */ };
    getCategorySize = (category: string): number | undefined => { /* VERBATIM */ };
    loadTags = () => { /* VERBATIM */ };
    setSelectedTag = (tag: string) => { /* VERBATIM */ };
    getTagSize = (tag: string): number | undefined => { /* VERBATIM */ };
    setSearchText = (text: string) => { /* VERBATIM */ };
    clearSearch = () => { /* VERBATIM */ };
    applyFilters = () => { /* VERBATIM */ };
    deleteNote = async (id: string, skipConfirm = false) => { /* VERBATIM */ };
    expandNote = (id: string) => { /* VERBATIM */ };
    collapseNote = () => { /* VERBATIM */ };
    addComment = (id: string) => { /* VERBATIM */ };
    updateNoteComment = (id: string, comment: string) => { /* VERBATIM */ };
    removeComment = (id: string) => { /* VERBATIM */ };
    getNote = (id: string): NoteItem | undefined => { /* VERBATIM */ };
    updateNoteContent = (id: string, content: string) => { /* VERBATIM */ };
    updateNoteLanguage = (id: string, language: string) => { /* VERBATIM */ };
    updateNoteEditor = (id: string, editor: string) => { /* VERBATIM */ };
    updateNoteTitle = (id: string, title: string) => { /* VERBATIM */ };
    updateNoteCategory = (id: string, category: string) => { /* VERBATIM */ };
    addNoteTag = (id: string, tag: string) => { /* VERBATIM */ };
    removeNoteTag = (id: string, tagIndex: number) => { /* VERBATIM */ };
    updateNoteTag = (id: string, tagIndex: number, newTag: string) => { /* VERBATIM */ };

    // NB-IMPL10 — drag/drop traits (relocated from VM):
    categoryTraitDrop = (dropItem: CategoryItem, payload: TraitDragPayload) => { /* VERBATIM */ };
    private createNoteFromLink = (link: ILink, category: string) => { /* VERBATIM */ };
    getCategoryDragData = (item: CategoryItem): { category: string } | null => { /* VERBATIM */ };
    moveCategory = async (fromCategory: string, toCategory: string) => { /* VERBATIM */ };

    // NB-IMPL13 — height persistence:
    getNoteHeight = (id: string): number | undefined => { /* VERBATIM */ };
    setNoteHeight = (id: string, height: number) => { /* VERBATIM */ };

    // NoteItemEditModel-facing state storage:
    getNoteState = (id: string, name: string): string | undefined => { /* VERBATIM */ };
    setNoteState = (id: string, name: string, value: string) => { /* VERBATIM */ };

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }
    async saveState(): Promise<void> {
        this.onDataChanged();
        await this._host?.io.saveState();
    }
    async dispose(): Promise<void> {
        this.onDataChanged();
        this._tearDownHostSubscriptions();
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

### Phase 4 — Create v4 `NotebookBody.tsx` (NB-IMPL8 + NB-IMPL10)

Create `src/renderer/editors/notebook/NotebookBody.tsx` (~250 LOC). Mirror of today's `NotebookView.tsx` body (without portal-target portals; without `useContentViewModel`). The breadcrumb / add-note + search / footer / overlay all relocate per NB-IMPL8.

Key shape (subset):

```typescript
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { CollapsiblePanel, CollapsiblePanelStack, Panel, Splitter, Text, Tree } from "../../uikit";
import { HighlightedTextProvider } from "../../uikit/shared/highlight";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import { NoteItemView } from "./NoteItemView";
import { ExpandedNoteView } from "./ExpandedNoteView";
import { TagsListView } from "./TagsListView";
import { buildCategoryTreeItems, type CategoryItem } from "./category-tree";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../core/traits";
import { LINK } from "../link-editor/linkTraits";
import { EditorError } from "../base/EditorError";
import { NotebookEditor } from "./NotebookEditor";

export function NotebookBody({ model: editor }: { model: NotebookEditor }) {
    const state = editor.state.use((s) => ({ /* all 13 fields needed by the body */ }));
    const gridModelRef = useRef<RenderGridModel | null>(null);

    // Identical render tree to today's NotebookView.tsx body:
    //   <Panel name="notebook-body" direction="row" flex={1} overflow="hidden">
    //     <CollapsiblePanelStack ...> tags / categories panels </CollapsiblePanelStack>
    //     <Splitter ...>
    //     <HighlightedTextProvider value={searchText}>
    //       <Panel name="notebook-notes-list" ...>
    //         <RenderFlexGrid renderCell=<NoteItemView ...>>
    //       </Panel>
    //     </HighlightedTextProvider>
    //   </Panel>
    //
    // ExpandedNoteView portals into editor.host.editorOverlayRef (unchanged).

    // Pass notebookModel={editor} (NotebookSource union — NB-IMPL3).
    return /* ... */ null;
}
```

### Phase 5 — Create v4 `index.tsx` (NB-IMPL12 + NB-IMPL8)

Create `src/renderer/editors/notebook/index.tsx` (~150 LOC). Mirror of `todo/index.tsx` structure with three contribution slots:

```typescript
import { TComponentState } from "../../core/state/state";
import { NotebookEditor, defaultNotebookEditorState } from "./NotebookEditor";
import { NotebookBody } from "./NotebookBody";
import { TextChrome } from "../base/v4/TextChrome";
import { Breadcrumb } from "../../uikit/Breadcrumb";
import { Button } from "../../uikit/Button";
import { IconButton } from "../../uikit/IconButton";
import { Input } from "../../uikit/Input";
import { CloseIcon, PlusIcon } from "../../theme/icons";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

function NotebookBreadcrumb({ editor }: { editor: NotebookEditor }) {
    const { expandedPanel, selectedCategory, selectedTag } = editor.state.use((s) => ({
        expandedPanel: s.expandedPanel,
        selectedCategory: s.selectedCategory,
        selectedTag: s.selectedTag,
    }));
    return expandedPanel === "tags" ? (
        <Breadcrumb
            name="notebook-breadcrumb"
            rootLabel="Tags"
            value={selectedTag}
            onChange={editor.setSelectedTag}
            separators=":"
            trailingParentSeparator
            size="sm"
        />
    ) : (
        <Breadcrumb
            name="notebook-breadcrumb"
            rootLabel="Categories"
            value={selectedCategory}
            onChange={editor.setSelectedCategory}
            size="sm"
        />
    );
}

function NotebookToolbarBits({ editor }: { editor: NotebookEditor }) {
    const searchText = editor.state.use((s) => s.searchText);
    return (
        <>
            <Button
                name="notebook-add-note"
                variant="primary"
                size="sm"
                icon={<PlusIcon />}
                title="Add Note"
                onClick={editor.addNote}
            >
                Add Note
            </Button>
            <Input
                name="notebook-search"
                size="sm"
                value={searchText}
                onChange={editor.setSearchText}
                placeholder="Search..."
                endSlot={
                    searchText ? (
                        <IconButton
                            name="notebook-search-clear"
                            size="sm"
                            icon={<CloseIcon />}
                            title="Clear search"
                            onClick={editor.clearSearch}
                        />
                    ) : null
                }
            />
        </>
    );
}

function NotebookFooterBits({ editor }: { editor: NotebookEditor }) {
    const { filteredCount, totalCount } = editor.state.use((s) => ({
        filteredCount: s.filteredNotes.length,
        totalCount: s.data.notes.length,
    }));
    return (
        <span>
            {filteredCount === totalCount
                ? `${totalCount} notes`
                : `${filteredCount} of ${totalCount} notes`}
        </span>
    );
}

function NotebookEditorView({ model }: { model: V4EditorModel }) {
    const notebook = model as NotebookEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<NotebookBreadcrumb editor={notebook} />}
            rightToolbarContributions={<NotebookToolbarBits editor={notebook} />}
            footerContributions={<NotebookFooterBits editor={notebook} />}
        >
            <NotebookBody model={notebook} />
        </TextChrome>
    );
}

export const notebookModule: EditorModule = {
    createEditor: () =>
        new NotebookEditor(new TComponentState({ ...defaultNotebookEditorState })),
    Component: NotebookEditorView,
};

// Legacy barrel re-exports preserved for backwards-compatibility with consumers
// that import from "./notebook" (e.g., NotebookViewModel + types):
export { NotebookEditor, defaultNotebookEditorState };
export type { NotebookEditorState, NotebookQueueEvent } from "./NotebookEditor";
export { NotebookViewModel, createNotebookViewModel, defaultNotebookViewState } from "./NotebookViewModel";
export type { NotebookViewState } from "./NotebookViewModel";
export type {
    NoteContent,
    NoteItem,
    NoteItemState,
    NotebookData,
    NotebookEditorProps,
    NotebookSource,
} from "./notebookTypes";
```

**Delete the old `notebook/index.ts` barrel** (replaced by `notebook/index.tsx` above).

### Phase 6 — Add `notebook-view` branch in `wrapLegacyForPage` (NB-IMPL6)

Edit `src/renderer/api/pages/PagesLifecycleModel.ts`:

1. Add the import alongside the existing Tier-5 imports near the top of the file:
   ```typescript
   import { NotebookEditor, defaultNotebookEditorState } from "../../editors/notebook";
   ```
2. Insert the `notebook-view` branch in `wrapLegacyForPage` AFTER the `rest-client` branch (currently at lines 240-249), BEFORE the `return new LegacyEditorAdapter(legacy, targetEditorId);` fallback. (See full body in NB-IMPL6 above.)

### Phase 7 — Registry mirror loop cleanup + native v4 register (NB-IMPL7)

Edit `src/renderer/editors/register-editors.ts`:

1. Remove `"notebook-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 782 — last entry). Replace with a final comment:
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
       // notebook-view removed — US-557 ships native v4 module.
       // All Tier-5 text content-views migrated. Set retained (empty) so the
       // mirror loop machinery stays in place for the no-host group (US-558+).
   ]);
   ```
2. Add a native v4 register block at the bottom of the file (after the US-563 rest-client block at lines 1183-1210). See full body in NB-IMPL7 above.
3. The legacy `editorRegistry.register({ id: "notebook-view", … })` block in register-editors.ts stays alive with its `loadModule` updated to import `./notebook/NotebookView` (was `./notebook/NotebookEditor`) per Phase 1.

### Phase 8 — Verify scripting / facade are untouched (NB-IMPL15)

Per NB10 / NB-IMPL15: **no `src/renderer/scripting/api-wrapper/NotebookEditorFacade.ts` exists or gets created; no `asNotebook` in `api/types/page.d.ts`; no changes to `PageWrapper.ts`.** Confirm via final grep across `src/renderer/scripting/api-wrapper/` and `src/renderer/api/types/page.d.ts`. **Zero file touches** in the scripting layer under US-557.

### Phase 9 — Verify zero unexpected `acquireViewModelSync("notebook-view")` callsites (NB-IMPL16)

Per NB-IMPL16: grep for `acquireViewModelSync("notebook-view")` and `loadViewModelFactory("notebook-view")` across the codebase. Expected zero hits. If any unexpected callsite exists, document and adjust accordingly.

### Phase 10 — Verification

1. **Type-check + lint:** `npx tsc --noEmit` + `npm run lint` — both clean (modulo the pre-existing `automation/commands.ts` + `worker/WorkerRunner.ts` errors documented in prior closures).
2. **Manual test plan:** run `npm start` and exercise the acceptance criteria below.

---

## Acceptance criteria

1. **Open `.note.json` file** — Notebook editor opens with category tree (left) + notes list (right); matches today's visual layout (no regressions in row sizing, search highlights, expanded-note overlay).
2. **Create new Notebook from sidebar "Notebook" button** (if such a button exists) — creates an `untitled.note.json` page with the v4 NotebookEditor (`page.mainEditorV4 instanceof NotebookEditor` in DevTools console).
3. **CRUD a note** — Add Note button creates a fresh note; edit content via the nested Monaco (or Grid/Markdown/etc.); JSON file updates within 300ms; delete confirms via `ui.confirm`.
4. **Category management** — create note in a category; drag the category onto another category → moveCategory `ui.confirm` fires; counts update correctly.
5. **Tag management** — add a tag like `release:1.0.1`; the parent `release:` tag appears in the tags list with aggregated count; clicking the parent tag filters to all `release:*` notes.
6. **Search** — type in search box; filteredNotes recomputes; HighlightedTextProvider highlights matches across category / title / tags / content; clearing search restores full list.
7. **Cross-editor LINK trait drop** — drag a link from PageNavigator into a category in the tree → creates a new note from the link (NB9 verbatim).
8. **JSON self-write loop (NB5)** — edit a note → file content updates in 300ms; editing the JSON externally (or via "Switch to Text Editor") → notebook re-parses without echo loop.
9. **HS1 persistence (NB3)** — close + reopen the page (or restart the app): `leftPanelWidth`, `expandedPanel` (tags vs categories), `selectedCategory`, `selectedTag` restore correctly.
10. **HS1 persistence cross-switch (NB3)** — switch Notebook ↔ Monaco ↔ Notebook: the 4 HS1 fields survive the round-trip.
11. **Per-note state preservation (NB8)** — in a note rendered as Grid, resize a column → reopen the notebook → column width preserved (writes via `notebook.data.state[noteId][name]` inside the JSON; same mechanism as today).
12. **Expanded note overlay** — click the expand icon on a note → ExpandedNoteView portals into TextFileModel.editorOverlayRef (the same overlay slot Monaco uses for find widgets); collapse returns to inline view; `expandedNoteId` does NOT persist on restart (intentional — NB2).
13. **Per-note editor switching** — switch a note's view from Monaco to Grid via the `<SegmentedControl>` in NoteItemToolbar → the nested view changes; `note.content.editor` field in JSON updates; reopen the notebook → the switched view persists.
14. **NO scripting facade exposure** — `app.pages.find(...).asNotebook` is `undefined` in script console; matches today behavior (NB-IMPL15).
15. **NO regression in other Tier-5 editors** — open Grid, Log View, Markdown, Mermaid, Svg, Html, Graph, Draw, Link, Todo, RestClient files; all switch widgets work; all v4 editors load correctly. Especially verify nested notes that render as Grid / Markdown / Svg / Mermaid / Html — they still load via NoteItemActiveEditor → AsyncEditor → legacy XxxView (outer-only scope contract — NB-IMPL1).
16. **`addEditorPage` path (if any consumers)** — verify by grepping for `addEditorPage.*"notebook-view"`; if any consumer exists (today's grep returns zero), exercise it.

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/renderer/editors/notebook/NotebookEditor.tsx` | **Renamed** to `NotebookView.tsx` via `git mv` | NB-IMPL2 — exported `NotebookEditor` function name UNCHANGED |
| `src/renderer/editors/notebook/NotebookView.tsx` | After rename: no body changes (legacy view path) | Triggered consumption via NoteItemActiveEditor under the inner-per-note legacy path |
| `src/renderer/editors/notebook/NotebookViewModel.ts` | **Preserved verbatim** | NB-IMPL2 — rollback safety; retires alongside LegacyEditorAdapter in US-559 |
| `src/renderer/editors/notebook/NotebookEditor.ts` | **NEW** (~700 LOC) | NB1 / NB2 / NB4 / NB5 / NB-IMPL5 / NB-IMPL10 / NB-IMPL13 — v4 class with TextFileModel host. All NotebookViewModel methods relocated byte-for-byte |
| `src/renderer/editors/notebook/NotebookBody.tsx` | **NEW** (~250 LOC) | v4 view body; reads via `editor.state.use`; passes `notebookModel={editor}` to NoteItemView |
| `src/renderer/editors/notebook/index.tsx` | **NEW** (~150 LOC) | NB-IMPL12 — `notebookModule: EditorModule` + `NotebookEditorView` wrapper (TextChrome + 3 contribution slots) + legacy barrel re-exports |
| `src/renderer/editors/notebook/index.ts` | **DELETED** | Replaced by `index.tsx` (file extension change) |
| `src/renderer/editors/notebook/notebookTypes.ts` | **Modified** | Add `NotebookSource = NotebookViewModel \| NotebookEditor` union type (NB-IMPL3) |
| `src/renderer/editors/notebook/NoteItemViewModel.ts` | **Modified** | NB-IMPL3 — `notebookModel: NotebookViewModel` → `notebookModel: NotebookSource` (single-line type widening at prop type + private field) |
| `src/renderer/editors/notebook/NoteItemView.tsx` | **NO CHANGE** | Consumes `props.notebookModel` methods identically against both classes |
| `src/renderer/editors/notebook/ExpandedNoteView.tsx` | **NO CHANGE** | Consumes `props.notebookModel` methods identically |
| `src/renderer/editors/notebook/TagsListView.tsx` | **NO CHANGE** | Pure view |
| `src/renderer/editors/notebook/category-tree.tsx` | **NO CHANGE** | Pure helper |
| `src/renderer/editors/notebook/note-editor/NoteItemEditModel.ts` | **Modified** | NB-IMPL4 — `notebookModel: NotebookViewModel` → `notebookModel: NotebookSource` (constructor param + private field). All behavior unchanged |
| `src/renderer/editors/notebook/note-editor/NoteItemActiveEditor.tsx` | **NO CHANGE** | Legacy content-view dispatch path preserved (outer-only scope) |
| `src/renderer/editors/notebook/note-editor/NoteItemToolbar.tsx` | **NO CHANGE** | Legacy content-view dispatch path preserved |
| `src/renderer/editors/notebook/note-editor/MiniTextEditor.tsx` | **NO CHANGE** | Legacy content-view dispatch path preserved |
| `src/renderer/editors/notebook/note-editor/index.ts` | **NO CHANGE** | Barrel preserved |
| `src/renderer/editors/base/ContentViewModelHost.ts` | **NO CHANGE** | Preserved alive; last consumer (NoteItemEditModel) keeps using it. Retires alongside legacy retirement in US-559 (or follow-up inner per-note migration task) |
| `src/renderer/editors/register-editors.ts` | **Modified** | Phase 1 — legacy `loadModule` imports `./notebook/NotebookView`; Phase 7 — remove `notebook-view` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` + add native v4 `v4EditorRegistry.register({ id: "notebook-view", … })` block |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | **Modified** | NB-IMPL6 — add `notebook-view` branch in `wrapLegacyForPage` + top-of-file import of `NotebookEditor` / `defaultNotebookEditorState` |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | **NO CHANGE** | NB-IMPL15 — no `asNotebook` |
| `src/renderer/api/types/page.d.ts` | **NO CHANGE** | NB-IMPL15 — no `asNotebook` declaration |
| `doc/active-work.md` | **Modified** | Move US-557 entry to investigation-complete status with link to this doc |

**Total file delta:** 3 new (NotebookEditor.ts, NotebookBody.tsx, index.tsx, plus this README); 1 rename (NotebookEditor.tsx → NotebookView.tsx); 1 deleted (`index.ts` superseded by `index.tsx`); 5 modified pre-existing files (notebookTypes.ts, NoteItemViewModel.ts, NoteItemEditModel.ts, register-editors.ts, PagesLifecycleModel.ts); 1 dashboard update.

**Estimated diff:** roughly +1100 / −10 LOC (most of the +1100 is the new NotebookEditor.ts which is a relocation from NotebookViewModel; NotebookViewModel itself stays alive so net real growth is ~+1100 LOC; the −10 covers small type widening edits).

---

## Open questions

None. All NB1–NB10 and NB-IMPL1–NB-IMPL17 resolved up front. Implementation is ready to begin.

Walkthrough [`29-notebook.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/29-notebook.md) amended 2026-05-24 with:
- NB6 amendment: "AMENDED 2026-05-24 — outer-only US-557 defers NB6 to US-579. `_vmHost` / `acquireViewModel*` / `ContentViewModelHost.ts` stay alive."
- NB7 amendment: "AMENDED 2026-05-24 — outer-only US-557 defers NB7 to US-579. `EditorConstructorArgs.initialHost` primitive not added under US-557; per-note dispatch stays on legacy AsyncEditor path."
- Migration scope §Outer-only amendment: walkthrough's deleted-files list amended — `NotebookViewModel.ts` PRESERVED; `ContentViewModelHost.ts` PRESERVED; NoteItemEditModel only gets type widening (NB-IMPL4) under US-557.
- Cross-walkthrough cleanups: items deferred to US-579.
