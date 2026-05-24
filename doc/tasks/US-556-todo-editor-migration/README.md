# US-556: Todo editor migration (EPIC-028 Phase C)

> **Status:** Investigation complete 2026-05-23, ready for implementation.
> **Walkthrough:** [`doc/epics/EPIC-028-editor-architecture/walkthroughs/25-todo.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/25-todo.md) (TD1–TD10 RESOLVED in design 2026-05-20).
> **Risk profile:** Lower than US-555 (Link). **First non-sidebar-owning Tier-5 text-bearing editor** since US-553 (LogView). No secondary-editor registrations, no `beforeNavigateAway` / `onMainEditorChanged` overrides, no TreeProvider, no duck-typed model decoration. The retrospective scope (TD11–TD17 mirroring LK11–LK16) carries over for legacy-view preservation + v4 wiring.

## Goal

Migrate the Todo collection editor (`.todo.json` files) from the legacy `TodoViewModel` + `LegacyEditorAdapter` pair to a native v4 `TodoEditor` class with `TextFileModel` as its `IContentHost`. Eighth Tier-5 editor in the uniform "EditorModel IS mainEditor + TextFileModel host with CONTENT_HOST_TRAIT" shape (after Monaco, Grid, LogView, Markdown, Svg, Html, Mermaid, Graph, Draw, Link). Retires the selection-state cache file (folds 3 fields into HS1 host slot — fifth instance of GR4 → LV3 → LK3 → DR4 / GR4 → TD3). Preserves the legacy `TodoViewModel` + today's React view for future notebook-embed (US-557).

## Background

### Today's surface

`src/renderer/editors/todo/` — 6 files:

| Group | Files |
|-------|-------|
| Core | `TodoViewModel.ts` (~733 LOC), `TodoEditor.tsx` (~289 LOC, React view), `todoTypes.ts`, `todoColors.ts` |
| Components | `components/TodoListPanel.tsx`, `components/TodoItemView.tsx` |

### Today's `TodoViewModel` state (8 fields)

```typescript
const defaultTodoEditorState = {
    data: { lists: [], tags: [], items: [], state: {} } as TodoData,
    error: undefined as string | undefined,
    leftPanelWidth: 200,
    listCounts: {} as { [listName: string]: ListCount },
    selectedList: "" as string,                  // empty = "All"
    selectedTag: "" as string,                   // empty = "All Tags"
    searchText: "" as string,
    filteredItems: [] as TodoItem[],
};
```

Plus 4 private fields (`lastSerializedData`, `skipNextContentUpdate`, `lastFilterState`, `selectionRestored`) and one `static cacheName = "todo-editor"`.

### Today's `TodoData` shape (root of `.todo.json`)

```typescript
interface TodoData {
    lists: string[];
    tags: TodoTag[];
    items: TodoItem[];
    /** Per-item UI state (e.g., content height for virtualized grid) — persists INSIDE the JSON file */
    state: { [itemId: string]: { contentHeight?: number } };
}
```

Per-item `contentHeight` stays in `data.state` (TD7) — it's a per-item property, not per-window state. Survives cross-window transfer with the file.

### JSON self-write pattern today

```
state mutation (addItem, toggleItem, setLeftPanelWidth, setItemHeight, …)
  → onDataChangedDebounced (300ms)
    → onDataChanged:
        if (error) return;
        if (items+lists+tags ref-unchanged) return;     // skip when only data.state (heights) changed
        skipNextContentUpdate = true;
        host.changeContent(JSON.stringify({type:"todo-editor", ...data}, null, 4), true);
host content subscription fires onContentChanged(content):
  if (skipNextContentUpdate) { skipNextContentUpdate = false; return; }
  loadData(content);                                     // external change re-parse
```

Same shape as LogView (LV6), Graph (GR7), Link (LK5). **Fourth instance** under EPIC-028.

**Subtle invariant:** `data.state` (per-item heights) IS serialized into the JSON file but does NOT participate in the reference-equality short-circuit. So height changes propagate to disk via the `state.subscribe` → debounced save path, BUT only piggyback on a save triggered by an `items` / `lists` / `tags` reference change — never trigger a save on their own. Edge case (write a height, then close the file without any other edit): height is lost. Today this is accepted noise. **Unchanged by US-556.**

### Selection-state cache file today

`<host.id>:todo-editor` cache file via `host.stateStorage.setState(host.id, "todo-editor", JSON.stringify({selectedList, selectedTag}))` — debounced 300ms; read once on first `loadData` via `selectionRestored` one-shot guard. Two-field cache (note: `leftPanelWidth` is NOT in this cache today — it rides VM state but is silently NOT persisted; same shape as Link's `leftPanelWidth` pre-LK2).

### Today's `TodoEditor.tsx` (React view, 289 LOC)

Today's view consumes the VM via:

```typescript
const vm = useContentViewModel<TodoViewModel>(model, "todo-view");
const pageState: TodoEditorState = useSyncExternalStore(
    vm ? (cb) => vm.state.subscribe(cb) : noopUnsubscribe,
    vm ? () => vm.state.get() : getDefaultState,
);
```

Plus three portal blocks:
- Search Input → `model.editorToolbarRefLast` (toolbar)
- Item count → `model.editorFooterRefLast` (footer)
- Center body: TodoListPanel (inline left panel) + Splitter + TodoListPanel + quick-add row + RenderFlexGrid

Body computes `separatorIndex` (first done item index), `rowCount` (items + 1 if separator visible), `getItemForRow` (translates virtual row index → real item accounting for separator), `getInitialRowHeight` (delegates to `vm.getItemHeight`).

Empty states (today):
- Zero items globally: "Create a list, then add your first todo item"
- Zero items match filter: "No items match the current filter"

Quick-add row: Input + IconButton, disabled when no list selected (`"Select a list to add items..."`).

### Today's `components/TodoListPanel.tsx` (inline left panel — NOT a secondary editor)

Renders inside `TodoEditor.tsx`'s render tree — composed directly into the body via `<TodoListPanel pageModel={vm} … />`. Contains:
- "New list..." Input + Add button.
- Lists section: "All" row + per-list `RowShell` (with rename + delete IconButtons on hover, count badge).
- Tags section: "All Tags" row + per-tag `RowShell` (with rename + delete IconButtons on hover, color Dot, color-change WithMenu).
- "New tag..." Input + Add button at bottom.

Pure view layer — every action delegates to VM methods. **No model-side reference to "panel" anywhere; not registered in `secondary-editor-registry.ts`.**

### Today's `components/TodoItemView.tsx` (item row)

Per-item row component:
- Checkbox (`CheckedIcon` / `UncheckedIcon`) → `vm.toggleItem(item.id)`.
- Title `Textarea` → `vm.updateItemTitle(item.id, t)`.
- Optional `Textarea` for comment → `vm.updateItemComment` / `vm.removeComment`.
- Tag chip with color Dot + WithMenu for tag re-selection → `vm.setItemTag`.
- Drag handle (undone items only) → uses `TraitTypeId.TodoItem` (`setTraitDragData` / `getTraitDragData` / `hasTraitDragData`).
- Delete IconButton (hover-reveal) → `vm.deleteItem(item.id)`.
- Reorder via HTML5 drag-and-drop → `vm.moveItem(fromId, toId)`.
- Height measurement via ResizeObserver → `vm.setItemHeight(item.id, h)`.

### Today's registration (`register-editors.ts:385-419`)

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

Plus `"todo-view"` is currently listed in `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 768) — the mirror loop ships a bare-adapter v4 stub for it.

### `wrapLegacyForPage` callers that hit todo-view today (PagesLifecycleModel.ts)

1. **`addEditorPage("todo-view", "json", "untitled.todo.json")`** — `tools-editors-registry.ts:87` (sidebar "Todo" button).
2. **`openFile(filePath)`** for any `.todo.json` file — registry resolves to `todo-view`.
3. **`openFile(filePath)` with content-peek** — any `.json` file whose content includes `"type":"todo-editor"` matches `isEditorContent` predicate.

All three currently fall through to `LegacyEditorAdapter` in `wrapLegacyForPage` (no `todo-view` branch exists). Under US-556 we add a `todo-view` branch that constructs a `TodoEditor` over the TextFileModel host — mirror of the existing `graph-view` / `draw-view` / `link-view` branches (PagesLifecycleModel.ts:176 / 189 / 204).

### Today's `acquireViewModel("todo-view")` consumers

Only ONE callsite:
- `src/renderer/scripting/api-wrapper/PageWrapper.ts:216` — `asTodo()` round-trip:
  ```typescript
  const vm = await model.acquireViewModel("todo-view") as TodoViewModel;
  this.releaseList.push(() => model.releaseViewModel("todo-view"));
  return new TodoEditorFacade(vm);
  ```

No browser-embed paths. No notebook-embed today (but US-557 will likely consume the legacy view via `NoteItemActiveEditor` → `AsyncEditor` → `module.Editor` — matching Graph / Draw / Link preservation pattern).

### HS1 — `host.editorSettings["todo-view"]` slot (US-552-B contract)

`IContentHost.getEditorState<T>(editorId)` / `setEditorState<T>(editorId, value)` already shipped (TextEditorModel.ts:306-318). The 3 persisted fields per TD3 amendment ride the host slot:

```typescript
interface TodoViewSettings {
    leftPanelWidth?: number;
    selectedList?: string;
    selectedTag?: string;
}
```

The slot is seeded into editor state inside `adoptHost`; a slice-subscribe mirror writes back on changes. Today's `<host.id>:todo-editor` cache file retires (orphan files linger harmlessly per P9). Today's `selectionRestored` one-shot flag retires alongside.

### Sibling reference — Draw + Link

Closest structural siblings: **Draw (US-565)** for non-sidebar-owning Tier-5 shape with HS1 single-field slot, and **Link (US-555)** for the JSON self-write pattern + retrospective preservation of legacy view/VM. Todo combines both:
- From Draw: minimal lifecycle hooks (no sidebar owning), HS1 host slot for persisted UI state, `_skipNextContentUpdate` flag, `host` typed getter (MK4 pattern), single-shape `index.tsx` module.
- From Link: ITodoSource-style structural typing for shared component props, `TodoSource` union type, legacy view rename to `TodoView.tsx`, preserved `TodoViewModel.ts` + `createTodoViewModel` factory, `wrapLegacyForPage` branch, registry mirror cleanup, facade flip via `instanceof` check.

### Override count: 9 hooks

Hooks Todo provides (vs Link's 11):

| Hook | TodoEditor | LinkEditor |
|------|-----------|------------|
| `applyRestoreData` | ✅ | ✅ |
| `switchFrom` | ✅ | ✅ |
| `restore` | ✅ | ✅ |
| `saveState` | ✅ | ✅ |
| `confirmRelease` | ✅ | ✅ |
| `getNavigatorTarget` | ✅ | ✅ |
| `findCompatibleEditors` | ✅ | ✅ |
| `getRestoreData` | ✅ | ✅ |
| `focus` | ✅ | ✅ |
| `dispose` | ✅ | ✅ |
| `beforeNavigateAway` | ❌ (TD6 — inherit) | ✅ (LK7) |
| `onMainEditorChanged` | ❌ (TD6 — inherit) | ✅ (LK8) |

Documents the **pay-only-when-used** property of `beforeNavigateAway` / `onMainEditorChanged` — a non-sidebar-owning editor doesn't mention them. **First text-bearing v4 editor to NOT exercise the sidebar lifecycle hooks since DrawEditor.**

---

## Concerns resolved up front

Most concerns inherit verbatim from walkthrough 25's TD1–TD10 (all RESOLVED 2026-05-20). New investigation surfaced seven retrospective concerns (TD11–TD17) carried from US-554/US-560/US-561/US-562/US-564/US-565/US-555 lessons.

### TD1 — Class topology

`TodoEditor` IS the page's `mainEditor`; HAS a `TextFileModel` content host with CONTENT_HOST_TRAIT exposed. **Eighth** Tier-5 editor in the uniform shape. Verbatim from walkthrough.

### TD2 — State slice partitioning

8 fields total. Under refactor:
- **3 persisted (HS1 host slot per TD3 amendment):** `leftPanelWidth`, `selectedList`, `selectedTag`.
- **4 ride-state stripped:** `data`, `error`, `listCounts`, `filteredItems`. (`data` derived from `host.content` via `loadData`; `listCounts` derived from `data.items` via `loadListCounts`; `filteredItems` derived from `data + selectedList + selectedTag + searchText` via `applyFilters`.)
- **1 transient (not persisted):** `searchText`.
- **4 private (non-state):** `skipNextContentUpdate`, `lastSerializedData`, `lastFilterState`, `_gridModel`. (`selectionRestored` retires per TD3 — no separate cache file to one-shot-guard against. `static cacheName` retires.)

Verbatim from walkthrough.

### TD3 — Selection-state cache → HS1 host slot

Today's `<host.id>:todo-editor` cache file retires. The 3 fields (`leftPanelWidth`, `selectedList`, `selectedTag`) ride `host.editorSettings["todo-view"]` per HS1 amendment. Survives Todo↔Monaco switches AND app restarts. `selectionRestored` one-shot flag retires (host-slot seed in `adoptHost` replaces it). **Fifth instance** of "per-editor cache file → host slot" (Grid GR4 → LogView LV3 → Link LK3 → Draw DR4 / Mermaid MR5 → Todo TD3). Pattern is now standardized.

**Incidental fix:** `leftPanelWidth` today rides VM state but is NOT persisted (silent today-bug). Folding into host slot adds persistence — **third instance of this incidental fix** (after Link LK2 and Markdown's equivalent). Verbatim from walkthrough TD3 amended 2026-05-21.

### TD4 — JSON parse/serialize lifecycle hooks

Three sites:
- `restore()` — initial parse via `loadData(host.content)`.
- `adoptHost` — host content subscription with `skipNextContentUpdate` guard. State→save subscription via `addSubscription(state.subscribe(onDataChangedDebounced))`.
- `dispose()` — flush pending save via `this.onDataChanged()`.

The state→save subscription happens once in `adoptHost`'s end (idempotent through `addSubscription` and debounce). Mirrors Link LK4 / Draw / Mermaid lifecycle shape. Verbatim from walkthrough.

### TD5 — `skipNextContentUpdate` flag

Verbatim port of today's editor-private flag. **Fourth instance** of the self-write-guard pattern (LogView LV6 → Link LK5 → Graph GR7 / Draw DR7 → Todo TD5). Verbatim from walkthrough.

### TD6 — Todo is NOT sidebar-owning (LK7 / LK8 N/A)

`TodoListPanel` stays as a child of `TodoBody` rendered directly via `<TodoListPanel pageModel={editor} … />`. No `setSidebarPanels` method, no `beforeNavigateAway` override, no `onMainEditorChanged` override, no model-side tag-slice subscription. **Override count: 9 (vs Link's 11).** Verbatim from walkthrough.

### TD7 — Per-item content heights stay in `data.state[id].contentHeight`

`contentHeight` is a function of the item's content (longer comment → taller row); it's a per-item property, not per-window. Survives cross-window transfer with the file. Mirrors Link's `data.state` per-collection split (LK2 reasoning). Verbatim from walkthrough.

### TD8 — `ui.confirm` / `ui.notify` direct calls from model mutators

Preserved verbatim. `deleteItem`, `deleteList`, `deleteTag` call `ui.confirm(...)` from the model layer with `skipConfirm=true` opt-out for script API. `moveItem` calls `ui.notify(..., "warning")` when a filter is active. `ui` is app-level by design. Verbatim from walkthrough.

### TD9 — `TraitTypeId.TodoItem` drag-and-drop trait

Preserved verbatim. The drag trait system (`TraitTypeId.X` via `setTraitDragData` / `getTraitDragData` / `hasTraitDragData`) is orthogonal to `EditorModel.traits` (which carries `CONTENT_HOST_TRAIT`). No refactor; `vm.moveItem` becomes `editor.moveItem` mechanically. Verbatim from walkthrough.

### TD10 — `accepts()` predicate + queue event union

Filename `.todo.json` priority 70 + content-peek priority 60 (`"type":"todo-editor"` + `"items"`); queue events `{ type: "focus" }` only; queue request `never`. Same minimal shape as Grid GR10 / Log View LV8 / Link LK10 / Draw / Mermaid. Verbatim from walkthrough.

### TD11 — File naming under preserved-legacy-view contract (NEW retrospective)

**Walkthrough deviation:** Walkthrough §Migration scope §Renamed files says "Today's `TodoEditor.tsx` renames to `TodoBody.tsx`". This contradicts US-554/US-560/US-561/US-562/US-564/US-565/US-555's retrospective preservation pattern (`*View.tsx` + `*ViewModel.ts` kept for notebook-embed via legacy `loadModule.Editor`).

**Resolution:** Rename today's `TodoEditor.tsx` → `TodoView.tsx` (file rename only; exported function name `TodoEditor` is UNCHANGED). This:
- Frees the `TodoEditor` name for the v4 class file `TodoEditor.ts`.
- Aligns with the preserved-sibling pattern (`GraphView.tsx`, `DrawView.tsx`, `MermaidView.tsx`, `HtmlView.tsx`, `SvgView.tsx`, `MarkdownView.tsx`, `LinkView.tsx`).
- Allows the legacy `editorRegistry.register({id:"todo-view", loadModule:…})` block to keep returning `{Editor: module.TodoEditor}` for future notebook-embed via `NoteItemActiveEditor` → `AsyncEditor` → `module.Editor`.

The new v4 files: `TodoEditor.ts` (class), `TodoBody.tsx` (v4 view shell), `index.tsx` (module wrapper).

### TD12 — Preserve `TodoViewModel.ts` (NEW retrospective)

**Walkthrough deviation:** Walkthrough §Migration scope §Deleted files says "TodoViewModel.ts (the file)" gets deleted. This contradicts the US-555 retrospective preservation pattern (LinkViewModel kept alive for embed paths).

**Resolution:** Preserve `TodoViewModel.ts` byte-for-byte. The `createTodoViewModel` factory and the legacy `editorRegistry.register({id:"todo-view", loadModule:async()=>({Editor: TodoView, createViewModel: createTodoViewModel, …})})` registration BOTH stay alive. This:
- Enables future notebook-embed in US-557 without a re-introduction migration.
- Mirrors Graph / Draw / Link / Markdown / Mermaid / Svg / Html which all preserve their legacy VM.
- Costs ~733 LOC retained; retirement deferred to US-559 alongside `LegacyEditorAdapter`.

### TD13 — Component prop dual-source typing (NEW retrospective)

Today's `TodoListPanel` and `TodoItemView` take `pageModel: TodoViewModel`. Under US-556 BOTH paths consume them — legacy `TodoView.tsx` continues to pass `TodoViewModel`, and new `TodoBody.tsx` passes `TodoEditor`.

**Resolution:** Change the `pageModel` prop typing to `TodoSource = TodoViewModel | TodoEditor` (TS union). Define `TodoSource` alias in `todoTypes.ts`:

```typescript
import type { TodoViewModel } from "./TodoViewModel";
import type { TodoEditor } from "./TodoEditor";
export type TodoSource = TodoViewModel | TodoEditor;
```

The methods called by panels — `setSelectedList`, `setSelectedTag`, `setLeftPanelWidth`, `setSearchText`, `clearSearch`, `addItem`, `toggleItem`, `updateItemTitle`, `addComment`, `updateItemComment`, `removeComment`, `deleteItem`, `moveItem`, `setItemTag`, `addList`, `renameList`, `deleteList`, `addTag`, `renameTag`, `deleteTag`, `updateTagColor`, `getItemHeight`, `setItemHeight`, `state.use()`, `state.subscribe()`, `state.get()` — all have identical signatures on both classes. TS union narrowing handles the dual-source case naturally without an explicit interface.

**Optionally** introduce `ITodoSource` structural interface (mirror of `ILinkSource` from LK12) and `implements ITodoSource` on both classes — but since there's no third consumer like `LinkTreeProvider` in the Link case, the bare union type suffices. Keep it minimal.

### TD14 — `wrapLegacyForPage` `todo-view` branch (NEW retrospective)

Mirror of `link-view` (PagesLifecycleModel.ts:204-213) and `draw-view` (lines 189-196) branches:

```typescript
// EPIC-028 / US-556 — Todo migrated to native v4 module. Construct TodoEditor
// over the legacy TextFileModel host. The initial loadData() call kicks off
// inline (mirrors today's TodoViewModel.onInit → loadData behavior). Non-
// sidebar-owning Tier-5 editor — no panel registration here.
if (isTextFile && targetEditorId === "todo-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const todo = new TodoEditor(
        new TComponentState({ ...defaultTodoEditorState, id }),
    );
    todo.adoptHost(legacy as TextFileModel);
    const content = (legacy as TextFileModel).state.get().content ?? "";
    todo.loadData(content);
    return todo;
}
```

Plus the top-of-file import:
```typescript
import { TodoEditor, defaultTodoEditorState } from "../../editors/todo";
```

Hits the three call sites enumerated above (sidebar Todo button + openFile + content-peek).

### TD15 — Registry mirror loop cleanup + native v4 register (NEW retrospective)

Remove `"todo-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (register-editors.ts:768) so the mirror loop no longer ships the bare-adapter stub for it. Add a native v4 register call at the bottom of register-editors.ts (mirror of US-565 draw-view block at lines 1074-1095 and US-555 link-view block at lines 1102-1129):

```typescript
// US-556 — replace the legacy bare-adapter mirror for todo-view with a
// native v4 module. `v4EditorRegistry.register` overwrites by id, so this
// supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
// to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
// to avoid duplicating extension/language/content-peek rules.
v4EditorRegistry.register({
    id: "todo-view",
    name: "ToDo",
    hasContentHost: true,
    accepts: (input) => {
        const legacy = editorRegistry.getById("todo-view");
        if (!legacy) return -1;
        if (input.fileName) {
            const p = legacy.acceptFile?.(input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        if (input.language) {
            const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
            if (p >= 0) return p;
        }
        // Content-peek fallback (TD10): for JSON files with todo-editor shape.
        if (input.language === "json" && input.host) {
            const content = (input.host.state.get() as { content?: string }).content ?? "";
            if (legacy.isEditorContent?.(input.language, content)) return 60;
        }
        return -1;
    },
    loadModule: async () => {
        const { todoModule } = await import("./todo");
        return todoModule;
    },
});
```

The legacy `editorRegistry.register({ id: "todo-view", … })` at line 386 STAYS ALIVE for future notebook-embed (TD12 preservation).

### TD16 — `page.asTodo()` facade flip (NEW retrospective)

Mirror of Link/Markdown/Mermaid/Graph/Draw facade flips. After `ensureEditor("todo-view", …)` switches/promotes todo-view, `page.mainEditorV4` IS a `TodoEditor`. The facade wraps it directly — no `acquireViewModel` round-trip needed:

```typescript
async asTodo(force = false): Promise<TodoEditorFacade> {
    await this.ensureEditor("todo-view", "Todo", "asTodo", force);
    const v4 = this.v4;
    if (!(v4 instanceof TodoEditor)) {
        throw new Error("asTodo(): page is not a TodoEditor after switch");
    }
    return new TodoEditorFacade(v4);
}
```

The legacy `acquireViewModel("todo-view")` + `releaseList.push(() => model.releaseViewModel("todo-view"))` retire from PageWrapper.ts. **The legacy `acquireViewModel` machinery itself STAYS ALIVE** — NoteItemEditModel still consumes it for notebook per-note dispatch; full retirement in US-557 / US-559.

`TodoEditorFacade.ts` constructor takes `TodoEditor` (was `TodoViewModel`); method bodies preserved (`this.vm.X` → `this.editor.X` — one-symbol rename across all methods). The `ITodoEditor` script-API contract (`api/types/todo-editor.d.ts`) is unchanged.

### TD17 — TextChrome toolbar/footer slot mapping (NEW retrospective)

Today's view uses three portal targets:
- `model.editorToolbarRefLast` — Search Input
- `model.editorFooterRefLast` — Item count

Under TextChrome contribution slots (walkthrough 09 / 10):
- `toolbarContributions` (left/breadcrumb slot) — UNUSED for Todo (no breadcrumb).
- `rightToolbarContributions` (right toolbar slot) — Search Input lands here.
- `footerContributions` — Item count lands here.

Same shape as Draw (which uses ONLY `rightToolbarContributions` for its 5 buttons; no left toolbar, no footer). Mirror of Markdown (which uses `toolbarContributions` for the search input on the left — Todo is symmetric but on the right since there's no breadcrumb to compete with). Either left or right works; chose `rightToolbarContributions` to match Draw's "right-aligned toolbar" pattern (Todo has no breadcrumb on the left).

---

## Implementation plan

### Phase 1 — Rename today's view file (TD11)

1. Rename `src/renderer/editors/todo/TodoEditor.tsx` → `src/renderer/editors/todo/TodoView.tsx` (via `git mv` to preserve history). Exported function name `TodoEditor` UNCHANGED.
2. Update legacy registry `loadModule` in `src/renderer/editors/register-editors.ts:406-418`:
   ```typescript
   loadModule: async () => {
       const [module, { createTodoViewModel }] = await Promise.all([
           import("./todo/TodoView"),
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
   ```
3. Verify: no other consumer imports `./todo/TodoEditor` (only the registry). Grep confirms zero hits outside `register-editors.ts`.

### Phase 2 — Add `TodoSource` union type alias (TD13)

Edit `src/renderer/editors/todo/todoTypes.ts`:

Add at the bottom (with type-only imports to avoid circular):

```typescript
import type { TodoViewModel } from "./TodoViewModel";
import type { TodoEditor } from "./TodoEditor";

/** Dual-source typing for shared components — legacy VM AND v4 editor share
 *  identical setter/getter signatures. Components don't care which they receive. */
export type TodoSource = TodoViewModel | TodoEditor;
```

### Phase 3 — Update component prop typing (TD13)

#### `src/renderer/editors/todo/components/TodoListPanel.tsx`

Change line 10 import + line 37 prop type:

```typescript
// Before:
import { TodoViewModel } from "../TodoViewModel";
// ...
interface TodoListPanelProps {
    pageModel: TodoViewModel;
    // ...
}

// After:
import type { TodoSource } from "../todoTypes";
// ...
interface TodoListPanelProps {
    pageModel: TodoSource;
    // ...
}
```

Method calls inside `TodoListPanel` (`pageModel.addList(...)`, `pageModel.renameList(...)`, `pageModel.deleteList(...)`, `pageModel.addTag(...)`, `pageModel.renameTag(...)`, `pageModel.deleteTag(...)`, `pageModel.updateTagColor(...)`, `pageModel.setSelectedList(...)`, `pageModel.setSelectedTag(...)`) — all compile identically against both classes; no body changes needed.

#### `src/renderer/editors/todo/components/TodoItemView.tsx`

Same treatment — line 13 import + line 18 prop type:

```typescript
// Before:
import { TodoViewModel } from "../TodoViewModel";
// ...
interface TodoItemViewProps {
    item: TodoItem;
    tags: TodoTag[];
    pageModel: TodoViewModel;
    cellRef?: React.RefObject<HTMLDivElement>;
}

// After:
import type { TodoSource } from "../todoTypes";
// ...
interface TodoItemViewProps {
    item: TodoItem;
    tags: TodoTag[];
    pageModel: TodoSource;
    cellRef?: React.RefObject<HTMLDivElement>;
}
```

Method calls (`pageModel.toggleItem`, `pageModel.updateItemTitle`, `pageModel.updateItemComment`, `pageModel.removeComment`, `pageModel.addComment`, `pageModel.deleteItem`, `pageModel.setItemTag`, `pageModel.moveItem`, `pageModel.setItemHeight`) — all compile identically. No body changes.

### Phase 4 — Create v4 `TodoEditor.ts` (TD1 / TD2 / TD4 / TD5)

Create `src/renderer/editors/todo/TodoEditor.ts` (~400 LOC). Mirror of `DrawEditor.ts` structure + Link's JSON self-write pattern + Todo's specific CRUD methods. Key pieces:

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
import type { RenderGridModel } from "../../uikit/RenderGrid";
import type { TodoItem, TodoTag, TodoData, ListCount } from "./todoTypes";

export type TodoQueueEvent = { type: "focus" };
export type TodoQueueRequest = never;

/** HS1 host-slot shape (TD3 amendment). */
interface TodoViewSettings {
    leftPanelWidth?: number;
    selectedList?: string;
    selectedTag?: string;
}

export interface TodoEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["todo-view"] (TD3):
    leftPanelWidth: number;
    selectedList: string;
    selectedTag: string;
    // View-derived — present on state for reactivity, stripped from
    // getRestoreData (TD2 / MO5 / GR8 / LV2 / LK2 pattern):
    data: TodoData;
    error: string | undefined;
    listCounts: { [listName: string]: ListCount };
    filteredItems: TodoItem[];
    // Transient UI state — not persisted (TD2):
    searchText: string;
}

export const defaultTodoEditorState: TodoEditorState = {
    id: "",
    title: "",
    modified: false,
    secondaryEditor: undefined,
    leftPanelWidth: 200,
    selectedList: "",
    selectedTag: "",
    data: { lists: [], tags: [], items: [], state: {} },
    error: undefined,
    listCounts: {},
    filteredItems: [],
    searchText: "",
};

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class TodoEditor extends V4EditorModel<TodoEditorState, void, TodoQueueEvent> {
    readonly editorId = "todo-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _pendingHost: HostDescriptor | undefined = undefined;

    // TD5 — self-write guard. TD4 — ref-equality marker for serialization skip:
    private skipNextContentUpdate = false;
    private lastSerializedData: TodoData | null = null;
    // Incremental-filter optimization (today's pattern):
    private lastFilterState = { searchText: "", selectedList: "", selectedTag: "" };
    // View ref (set by view; not on state):
    private _gridModel: RenderGridModel | null = null;

    // Debounced save — today's pattern (300ms):
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    readonly typedQueue: ComponentQueue<TodoQueueEvent, TodoQueueRequest>;

    constructor(state: TComponentState<TodoEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            TodoQueueEvent,
            TodoQueueRequest
        >;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from TodoEditor");
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
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
    }

    // ── Host accessors ──────────────────────────────────────────────────

    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
    }

    /** Typed host accessor for body consumption (MK4 pattern). */
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

    // ── Persistence (TD2 + TD3) ─────────────────────────────────────────

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Identity-only descriptor. The 3 HS1 fields ride the host slot.
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

    applyRestoreData(data: RestoreData<TodoEditorState>): void {
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
        if (!trait) throw new Error(`TodoEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`);
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("TodoEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore Todo editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._tearDownHostSubscriptions();

        // Forward host metadata to descriptorChanged (P3 debounce):
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send(undefined));

        // TD4 + TD5 — re-parse on external content changes, skipNext guard:
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

        // HS1 — seed from host slot (sync, no flicker):
        const saved = host.getEditorState<TodoViewSettings>(this.editorId);
        if (saved) {
            this.state.update((s) => {
                if (saved.leftPanelWidth !== undefined) s.leftPanelWidth = saved.leftPanelWidth;
                if (saved.selectedList !== undefined)   s.selectedList = saved.selectedList;
                if (saved.selectedTag !== undefined)    s.selectedTag = saved.selectedTag;
            });
        }

        // HS1 — mirror back. Slice-subscribe over a tuple string so any of
        // the 3 slots triggers a write but data/derived/transient changes don't.
        this._settingsUnsub = this.state.subscribe(
            () => {
                if (!this._host) return;
                const s = this.state.get();
                this._host.setEditorState<TodoViewSettings>(this.editorId, {
                    leftPanelWidth: s.leftPanelWidth,
                    selectedList: s.selectedList,
                    selectedTag: s.selectedTag,
                });
            },
            (s) => `${s.leftPanelWidth}|${s.selectedList}|${s.selectedTag}`,
        );

        // TD4 — state subscription → debounced save (idempotent via
        // addSubscription; debounce coalesces re-subscriptions on switch-in).
        this.addSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled.todo.json");
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

    // ── JSON parse/serialize (TD4 / TD5 — relocated verbatim from TodoViewModel) ──

    loadData(content: string): void {
        // VERBATIM RELOCATE FROM TodoViewModel.loadData (lines 132-215).
        // All `this.` field reads use TodoEditor's fields.
        // ...
    }

    private onDataChanged = (): void => {
        const { data, error } = this.state.get();
        if (error) return;
        if (
            data.items !== this.lastSerializedData?.items ||
            data.lists !== this.lastSerializedData?.lists ||
            data.tags !== this.lastSerializedData?.tags
        ) {
            this.lastSerializedData = data;
            this.skipNextContentUpdate = true;
            const content = JSON.stringify({ type: "todo-editor", ...data }, null, 4);
            this._host?.changeContent(content, true);
        }
    };

    // ── State mutators (relocated VERBATIM from TodoViewModel) ──────────

    // List counts
    loadListCounts = (): void => { /* VERBATIM from TodoViewModel.loadListCounts */ };
    getListCount = (listName: string): ListCount | undefined => { /* VERBATIM */ };

    // List selection
    setSelectedList = (listName: string): void => { /* VERBATIM minus saveSelectionStateDebounced */ };

    // Search
    setSearchText = (text: string): void => { /* VERBATIM */ };
    clearSearch = (): void => { /* VERBATIM */ };

    // Filtering
    applyFilters = (): void => { /* VERBATIM from TodoViewModel.applyFilters */ };

    // Item CRUD
    addItem = (title: string): void => { /* VERBATIM */ };
    toggleItem = (id: string): void => { /* VERBATIM */ };
    updateItemTitle = (id: string, title: string): void => { /* VERBATIM */ };
    addComment = (id: string): void => { /* VERBATIM */ };
    updateItemComment = (id: string, comment: string): void => { /* VERBATIM */ };
    removeComment = (id: string): void => { /* VERBATIM */ };
    deleteItem = async (id: string, skipConfirm?: boolean): Promise<void> => { /* VERBATIM */ };

    // Item reordering
    moveItem = (fromId: string, toId: string): void => { /* VERBATIM */ };

    // List management
    addList = (name: string): boolean => { /* VERBATIM */ };
    renameList = (oldName: string, newName: string): boolean => { /* VERBATIM */ };
    deleteList = async (name: string, skipConfirm?: boolean): Promise<void> => { /* VERBATIM */ };

    // Tag selection
    setSelectedTag = (tagName: string): void => { /* VERBATIM minus saveSelectionStateDebounced */ };

    // Tag management
    addTag = (name: string): boolean => { /* VERBATIM */ };
    renameTag = (oldName: string, newName: string): boolean => { /* VERBATIM */ };
    updateTagColor = (tagName: string, color: string): void => { /* VERBATIM */ };
    deleteTag = async (name: string, skipConfirm?: boolean): Promise<void> => { /* VERBATIM */ };

    // Item tag assignment
    setItemTag = (id: string, tagName: string | null): void => { /* VERBATIM */ };
    getTag = (name: string): TodoTag | undefined => { /* VERBATIM */ };

    // UI state
    setLeftPanelWidth = (width: number): void => { /* VERBATIM */ };

    // Item height persistence (for RenderFlexGrid initial sizing)
    getItemHeight = (id: string): number | undefined => { /* VERBATIM */ };
    setItemHeight = (id: string, height: number): void => { /* VERBATIM */ };

    // Normalize helpers — verbatim from TodoViewModel
    private normalizeItem = (raw: Partial<TodoItem>): TodoItem => { /* VERBATIM */ };
    private normalizeTag = (raw: Partial<TodoTag>): TodoTag => { /* VERBATIM */ };

    // View ref setter
    setGridModel(model: RenderGridModel | null): void { this._gridModel = model; }
    get gridModel(): RenderGridModel | null { return this._gridModel; }

    // ── Save / release / dispose ────────────────────────────────────────

    async confirmRelease(closing?: boolean): Promise<boolean> {
        return this._host ? this._host.confirmRelease(closing) : true;
    }

    async saveState(): Promise<void> {
        this.onDataChanged();   // flush pending debounced save
        await this._host?.io.saveState();
    }

    async dispose(): Promise<void> {
        this.onDataChanged();   // flush pending debounced save
        this._tearDownHostSubscriptions();
        this._gridModel = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

The `/* VERBATIM */` bodies are byte-for-byte relocated from today's `TodoViewModel.ts` (lines noted in walkthrough). Field reads use `this._host` instead of `this.host`. The `ui.confirm` / `ui.notify` calls (`deleteItem`, `deleteList`, `deleteTag`, `moveItem`) remain unchanged. The TD3 mechanics drop `restoreSelectionState` / `saveSelectionState` / `saveSelectionStateDebounced` / `selectionRestored` / `static cacheName` entirely — replaced by the HS1 slice-subscribe mirror.

### Phase 5 — Create v4 `TodoBody.tsx` (view body)

Create `src/renderer/editors/todo/TodoBody.tsx` (~200 LOC). Mirror of today's `TodoView.tsx` body, with:
- `useContentViewModel` → removed (replaced by direct prop typing `editor: TodoEditor`).
- `useSyncExternalStore` → replaced by `editor.state.use((s) => ({...}))` reactive selector.
- Portal blocks → removed (toolbar moves to `TodoToolbarBits`, footer moves to `TodoFooterBits` — both in `index.tsx`).
- Center body (left panel + Splitter + quick-add row + RenderFlexGrid + empty states) preserved verbatim from today's `TodoView.tsx`.
- Queue focus handler: `editor.queue.use((ev) => { if (ev.type === "focus") { /* no-op for now */ } });` — kept for symmetry with Tier-5 template even though Todo has no explicit refocus today.

```typescript
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel } from "../../uikit/Panel/Panel";
import { Input } from "../../uikit/Input/Input";
import { Textarea } from "../../uikit/Textarea/Textarea";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { Splitter } from "../../uikit/Splitter/Splitter";
import { RenderFlexGrid, RenderGridModel } from "../../uikit/RenderGrid";
import type { RenderFlexCellParams, Percent } from "../../uikit/RenderGrid";
import color from "../../theme/color";
import { PlusIcon } from "../../theme/icons";
import { TodoEditor } from "./TodoEditor";
import type { TodoItem } from "./todoTypes";
import { TodoListPanel } from "./components/TodoListPanel";
import { TodoItemView } from "./components/TodoItemView";
import { EditorError } from "../base/EditorError";

const getColumnWidth = () => "100%" as Percent;

export function TodoBody({ model: editor }: { model: TodoEditor }) {
    const state = editor.state.use((s) => ({
        data: s.data,
        error: s.error,
        leftPanelWidth: s.leftPanelWidth,
        listCounts: s.listCounts,
        selectedList: s.selectedList,
        selectedTag: s.selectedTag,
        filteredItems: s.filteredItems,
        searchText: s.searchText,
    }));

    const allItems = state.data.items;
    const tags = state.data.tags;
    const items = state.filteredItems;
    const [quickAddText, setQuickAddText] = useState("");

    const gridModelRef = useRef<RenderGridModel | null>(null);
    const setGridModel = useCallback((m: RenderGridModel | null) => {
        gridModelRef.current = m;
        editor.setGridModel(m);
    }, [editor]);

    useEffect(() => {
        gridModelRef.current?.update({ all: true });
    }, [items, tags]);

    const separatorIndex = useMemo(() => {
        const firstDoneIndex = items.findIndex((item: TodoItem) => item.done);
        return firstDoneIndex > 0 ? firstDoneIndex : -1;
    }, [items]);

    const rowCount = items.length + (separatorIndex >= 0 ? 1 : 0);

    const getItemForRow = useCallback(
        (row: number): TodoItem | undefined => {
            if (separatorIndex >= 0 && row === separatorIndex) return undefined;
            const itemIndex = separatorIndex >= 0 && row > separatorIndex ? row - 1 : row;
            return items[itemIndex];
        },
        [items, separatorIndex]
    );

    const getInitialRowHeight = useCallback(
        (row: number) => {
            const item = getItemForRow(row);
            if (!item) return undefined;
            return editor.getItemHeight(item.id);
        },
        [getItemForRow, editor]
    );

    // Quick-add + cell renderer — relocated verbatim from TodoView.tsx ...

    editor.queue.use((ev) => {
        if (ev.type === "focus") {
            // Kept for Tier-5 symmetry; harmless no-op.
        }
    });

    if (state.error) return <EditorError>{state.error}</EditorError>;

    const isQuickAddDisabled = !state.selectedList;

    return (
        <Panel name="todo-root" direction="row" flex={1} overflow="hidden">
            <Panel name="todo-left-panel" /* ... */ width={state.leftPanelWidth}>
                <TodoListPanel
                    pageModel={editor}
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
                onChange={editor.setLeftPanelWidth}
                border="after"
                min={100}
            />
            <Panel name="todo-content" direction="column" flex={1} minWidth={0} overflow="hidden">
                {/* quick-add row + RenderFlexGrid + empty states — verbatim from TodoView.tsx */}
            </Panel>
        </Panel>
    );
}
```

The body code reuses the existing `TodoListPanel` and `TodoItemView` components — `pageModel={editor}` works under the `TodoSource` union from Phase 3.

### Phase 6 — Create v4 `index.tsx` (TD17 + module export)

Create `src/renderer/editors/todo/index.tsx` (~100 LOC). Composes `<TextChrome>` + `<TodoBody>` + `<TodoToolbarBits>` (right slot) + `<TodoFooterBits>`:

```typescript
import { TComponentState } from "../../core/state/state";
import { TodoEditor, defaultTodoEditorState } from "./TodoEditor";
import { TodoBody } from "./TodoBody";
import { TextChrome } from "../base/v4/TextChrome";
import { Input } from "../../uikit/Input/Input";
import { IconButton } from "../../uikit/IconButton/IconButton";
import { CloseIcon } from "../../theme/icons";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-556 — native Todo editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorV4` is a v4-native TodoEditor instance.
 *
 * Right-toolbar bits (TD17 — relocates legacy TodoView's portal search input):
 *   - search Input (with clear button when text present)
 *
 * Footer bits:
 *   - item count: "<filtered> of <total> items" / "<total> items"
 *
 * No left-toolbar contributions (no breadcrumb).
 */

function TodoToolbarBits({ model: editor }: { model: TodoEditor }) {
    const searchText = editor.state.use((s) => s.searchText);
    return (
        <Input
            name="todo-search"
            value={searchText}
            onChange={editor.setSearchText}
            placeholder="Search..."
            endSlot={
                searchText ? (
                    <IconButton
                        name="todo-search-clear"
                        size="sm"
                        icon={<CloseIcon />}
                        title="Clear search"
                        onClick={editor.clearSearch}
                    />
                ) : null
            }
        />
    );
}

function TodoFooterBits({ model: editor }: { model: TodoEditor }) {
    const { filteredCount, totalCount } = editor.state.use((s) => ({
        filteredCount: s.filteredItems.length,
        totalCount: s.data.items.length,
    }));
    return (
        <span>
            {filteredCount === totalCount
                ? `${totalCount} items`
                : `${filteredCount} of ${totalCount} items`}
        </span>
    );
}

function TodoEditorView({ model }: { model: V4EditorModel }) {
    const todo = model as TodoEditor;
    return (
        <TextChrome
            model={model}
            rightToolbarContributions={<TodoToolbarBits model={todo} />}
            footerContributions={<TodoFooterBits model={todo} />}
        >
            <TodoBody model={todo} />
        </TextChrome>
    );
}

export const todoModule: EditorModule = {
    createEditor: () =>
        new TodoEditor(new TComponentState({ ...defaultTodoEditorState })),
    Component: TodoEditorView,
};

export { TodoEditor, defaultTodoEditorState };
export type { TodoEditorState, TodoQueueEvent } from "./TodoEditor";
```

### Phase 7 — `wrapLegacyForPage` branch (TD14)

Edit `src/renderer/api/pages/PagesLifecycleModel.ts`:

1. Top-of-file import (near the existing GraphEditor / DrawEditor / LinkEditor imports):
```typescript
import { TodoEditor, defaultTodoEditorState } from "../../editors/todo";
```

2. Add branch after the `link-view` branch (insert after line 213, before the final `return new LegacyEditorAdapter(legacy, targetEditorId);`):
```typescript
// EPIC-028 / US-556 — Todo migrated to native v4 module. Construct TodoEditor
// over the legacy TextFileModel host. The initial loadData() call kicks off
// inline (mirrors today's TodoViewModel.onInit → loadData behavior). Non-
// sidebar-owning Tier-5 editor — no panel registration here.
if (isTextFile && targetEditorId === "todo-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const todo = new TodoEditor(
        new TComponentState({ ...defaultTodoEditorState, id }),
    );
    todo.adoptHost(legacy as TextFileModel);
    const content = (legacy as TextFileModel).state.get().content ?? "";
    todo.loadData(content);
    return todo;
}
```

### Phase 8 — Update registry mirror + v4 register (TD15)

Edit `src/renderer/editors/register-editors.ts`:

1. Remove `"todo-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 768):
   ```typescript
   const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
       // grid-* removed — US-552 ships native v4 modules.
       // log-view removed — US-553 ships native v4 module.
       // md-view removed — US-554 ships native v4 module.
       // ...
       // draw-view removed — US-565 ships native v4 module.
       // link-view removed — US-555 ships native v4 module.
       // todo-view removed — US-556 ships native v4 module.
       "notebook-view",
       "rest-client",
   ]);
   ```

2. Add native v4 register call near the bottom of register-editors.ts (after the `link-view` v4 block at lines 1102-1129). See TD15 above for the full register block.

The legacy `editorRegistry.register({ id: "todo-view", … })` at line 386 STAYS ALIVE for future notebook-embed (TD12 preservation).

### Phase 9 — Update `page.asTodo` facade + `TodoEditorFacade` (TD16)

#### `src/renderer/scripting/api-wrapper/TodoEditorFacade.ts`

Rewrite constructor to take `TodoEditor`; method bodies one-symbol rename (`this.vm.X` → `this.editor.X`):

```typescript
import type { TodoEditor } from "../../editors/todo";
import type { TodoItem, TodoTag } from "../../editors/todo/todoTypes";

/**
 * Safe facade around v4 TodoEditor for script access.
 * Implements the ITodoEditor interface from api/types/todo-editor.d.ts.
 *
 * - Items are read-only snapshots (ITodoItem projection of TodoItem)
 * - `done` is exposed as `completed`, `tag: null` becomes `""`
 * - Delete operations skip confirmation dialogs
 */
export class TodoEditorFacade {
    constructor(private readonly editor: TodoEditor) {}

    get items(): Array<{ readonly id: string; readonly title: string; readonly completed: boolean; readonly list: string; readonly tag: string }> {
        return this.editor.state.get().data.items.map(mapItem);
    }

    get lists(): string[] {
        return this.editor.state.get().data.lists;
    }

    get tags(): Array<{ readonly name: string; readonly color: string }> {
        return this.editor.state.get().data.tags.map(mapTag);
    }

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

function mapItem(item: TodoItem) {
    return {
        id: item.id,
        title: item.title,
        completed: item.done,
        list: item.list,
        tag: item.tag ?? "",
    };
}

function mapTag(tag: TodoTag) {
    return {
        name: tag.name,
        color: tag.color,
    };
}
```

#### `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Replace the existing `asTodo` method (line 210-219) with the v4 flip:

```typescript
async asTodo(force = false): Promise<TodoEditorFacade> {
    await this.ensureEditor("todo-view", "Todo", "asTodo", force);
    const v4 = this.v4;
    if (!(v4 instanceof TodoEditor)) {
        throw new Error("asTodo(): page is not a TodoEditor after switch");
    }
    return new TodoEditorFacade(v4);
}
```

Plus add at top-of-file:
```typescript
import { TodoEditor } from "../../editors/todo";
```

Drop the existing `import type { TodoViewModel }` line (no longer needed in PageWrapper — the facade owns its own typed import).

### Phase 10 — Verify tsc + eslint

```bash
npm run lint
```

Zero NEW errors on touched files. Pre-existing warnings (e.g., TodoView.tsx's eslint warnings inherited from today's TodoEditor.tsx) tolerated identically to Graph/Draw/Link.

### Phase 11 — Manual acceptance tests

See Acceptance Criteria below — 12 manual tests.

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/renderer/editors/todo/TodoEditor.tsx` | RENAME → `TodoView.tsx` | TD11 — preserved for future notebook-embed; exported function name `TodoEditor` unchanged |
| `src/renderer/editors/todo/TodoEditor.ts` | NEW | v4 class (~400 LOC); CONTENT_HOST_TRAIT; HS1 host slot for 3 fields; verbatim relocation of all TodoViewModel methods; NO sidebar lifecycle hooks (TD6) |
| `src/renderer/editors/todo/TodoBody.tsx` | NEW | v4 body (~200 LOC); `editor.state.use(...)` selector reads; no portals; renders TodoListPanel inline + RenderFlexGrid |
| `src/renderer/editors/todo/index.tsx` | NEW | Module wrapper (~100 LOC); TextChrome + right toolbar (search) + footer (item count) |
| `src/renderer/editors/todo/TodoViewModel.ts` | PRESERVE | TD12 — kept for future notebook-embed (US-557); `createTodoViewModel` factory unchanged |
| `src/renderer/editors/todo/todoTypes.ts` | MODIFY | TD13 — add `TodoSource = TodoViewModel \| TodoEditor` union type alias |
| `src/renderer/editors/todo/todoColors.ts` | unchanged | Re-export of TAG_COLORS only |
| `src/renderer/editors/todo/components/TodoListPanel.tsx` | MODIFY | TD13 — `pageModel: TodoViewModel` → `pageModel: TodoSource`; method calls preserved verbatim |
| `src/renderer/editors/todo/components/TodoItemView.tsx` | MODIFY | TD13 — `pageModel: TodoViewModel` → `pageModel: TodoSource`; method calls preserved verbatim |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | MODIFY | TD14 — import `{TodoEditor, defaultTodoEditorState}`; add `todo-view` branch in `wrapLegacyForPage` after link-view branch |
| `src/renderer/editors/register-editors.ts` | MODIFY | TD11 — update legacy `loadModule` import path (TodoEditor → TodoView). TD15 — remove `todo-view` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; add v4 register call at bottom |
| `src/renderer/scripting/api-wrapper/TodoEditorFacade.ts` | REWRITE | TD16 — constructor takes `TodoEditor` (was `TodoViewModel`); method bodies `this.vm.X` → `this.editor.X` |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | MODIFY | TD16 — `asTodo` flips from `acquireViewModel` to v4 `instanceof` check; drop `TodoViewModel` type import |

**Files that need NO changes** (so don't waste investigation time):
- `src/renderer/api/types/todo-editor.d.ts` — `ITodoEditor` script-API contract unchanged.
- `src/renderer/ui/sidebar/tools-editors-registry.ts` — sidebar Todo button calls `pagesModel.addEditorPage("todo-view", "json", "untitled.todo.json")` — works as-is, hits the new `wrapLegacyForPage` branch.
- `src/renderer/editors/base/v4/editorRegistry.ts` — title-fallback already shipped in US-565.
- `src/renderer/editors/base/v4/TextChrome.tsx` — contribution slots already accept `toolbarContributions` / `rightToolbarContributions` / `footerContributions`.
- `src/renderer/theme/palette-colors.ts` — TAG_COLORS unchanged.

---

## Acceptance criteria

1. **Open existing `.todo.json` file** — opens in native v4 TodoEditor with all lists, tags, items visible. Center grid renders with virtualization. Per-item heights restored from `data.state[id].contentHeight`.
2. **Create new empty Todo page** — sidebar "Todo" button creates `untitled.todo.json` page. Editor switch widget shows "Text Editor" + "ToDo" buttons (title-fallback in registry works).
3. **Add list, add item to list** — type list name + Add → list appears in left panel. Click list → selected (filters center grid). Type quick-add text + Enter → item appears at top of undone group.
4. **Toggle / edit / delete items** — checkbox toggles done; Textarea edits title; comment Textarea adds/removes; delete with confirmation works. JSON content auto-saves to host (verify via "Switch to Text Editor" — content reflects changes including the JSON `"type":"todo-editor"` wrapper).
5. **Drag-and-drop reorder (undone only)** — drag undone item by handle, drop on another undone item → reorder works. Drag attempt on done item → preventDefault (no drag start). Drag attempt with tag filter active → toast warning "Deselect tag filter to reorder items".
6. **Add tag, color picker, tag filter** — type tag name + Add → tag appears below lists. Click tag dot → color picker menu → pick color. Click tag row → filters center grid. Assign tag to item via "+ tag" menu on item row.
7. **HS1 persistence** — set leftPanelWidth=300, selectedList="Shopping", selectedTag="urgent"; switch to Monaco (raw JSON); switch back → state restored. Restart app → state restored across restart. (`<host.id>:todo-editor` cache file no longer written; orphan files linger harmlessly.)
8. **Item height persistence across windows** — open `.todo.json` on Window A; measure heights via ResizeObserver. Open same file on Window B — initial heights match (read from `data.state[id].contentHeight` inside the JSON file).
9. **Search filter** — type in right-toolbar search → grid filters (multi-word AND). Clear button appears when text present → click → clears.
10. **Switch widget visible** — `.todo.json` shows both "ToDo" and "Text Editor" buttons in chrome (per `findEditorsAccepting` length ≥ 2). Switch to Text Editor → raw JSON visible in Monaco; switch back → TodoEditor (host preserved across the switch via CONTENT_HOST_TRAIT).
11. **Script API `page.asTodo()`** — run script that calls `await page.asTodo(); …addList(...); addItem(...)…` on an active Todo page. List + item added; UI re-renders.
12. **JSON self-write loop quiet** — open Todo page; idle for 5 seconds. No console errors; no infinite content↔state loop; modified flag accurate. Height changes via ResizeObserver do NOT trigger immediate saves (TD7 — they piggyback on the next items/lists/tags reference change).

---

## Notes

- **Sibling reference:** Mirror of **Draw (US-565)** for non-sidebar-owning Tier-5 shape + HS1 single-slot pattern. **Link (US-555)** for the JSON self-write pattern, dual-source typing, retrospective view/VM preservation, registry mirror cleanup, and facade flip.
- **9 lifecycle hooks** (vs Link's 11). First text-bearing v4 editor since Draw to NOT exercise `beforeNavigateAway` / `onMainEditorChanged`. Documents the **pay-only-when-used** property of sidebar lifecycle hooks.
- **TodoListPanel + TodoItemView** stay as inline components in `components/`. Their `pageModel` prop changes from `TodoViewModel` to `TodoSource` union; method calls preserved verbatim. Zero method-body edits inside the panels.
- **`<host.id>:todo-editor` cache file orphans linger harmlessly** per P9 — no migration shim. Today's two-field cache (`selectedList`, `selectedTag`) plus the incidentally-fixed `leftPanelWidth` (today not persisted) all ride HS1 going forward.
- **`per-item content height` STAYS in `data.state[id].contentHeight`** inside the JSON file (TD7). Per-item, not per-window. Survives cross-window transfer with the file. **NOT moved to descriptor** — different scope than `leftPanelWidth` / `selectedList` / `selectedTag`.
- **TraitTypeId.TodoItem drag system unchanged** (TD9). The drag trait system (data shapes) is orthogonal to EditorModel.traits (capability shapes). `setTraitDragData` / `getTraitDragData` / `hasTraitDragData` calls preserved byte-for-byte.
- **Risk envelope:** Smaller than US-555 (Link). 6 files in the folder. Zero embed sites. No sidebar lifecycle hooks. No TreeProvider. Retrospective concerns (TD11–TD17) carry over but with reduced scope — only one preserved view file, only one cache-file → HS1 slot consolidation (3 fields), no secondary-editor wrappers, no duck-typed reads to preserve. **Expected diff envelope: ~700 LOC added (TodoEditor.ts + TodoBody.tsx + index.tsx) + ~50 LOC modified across 7 files; ~733 LOC preserved (TodoViewModel.ts).**
- **Next walkthrough exercise:** Rest Client (US-563 / walkthrough 26) — pending pre-check during US-563 investigation of whether Rest Client's collection sidebar is sidebar-registered (would be second sidebar-owner — first since US-555) or inline (would be ninth Tier-5 in non-sidebar-owning shape, like Todo). The Todo migration confirms the template carries cleanly through the non-sidebar-owning case.
