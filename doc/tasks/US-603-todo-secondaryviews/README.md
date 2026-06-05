# US-603: Todo → `SecondaryViews`

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 3 · **Status:** 📝 Investigated — plan + concerns ready for review. Not yet implemented. Per the epic deferred-review model, stays `[ ]` on the dashboard until US-607 close-out.

## Goal

Move the Todo editor's left side panel — today a **single** `TodoListPanel` (Lists + Tags in one component, rendered inline in `TodoBody`) — out of the bespoke `<Panel>`+`<Splitter>` layout and re-implement it as **one** registered SecondaryView named **"Todo"** (`todo-panel`). Behaviour is **unchanged**: same Lists section, same Tags section, same add/rename/delete, same filtering, same tag colors. The panel is present **only while the Todo editor is the page's main editor** and **drops when the page navigates away** to another file — the canonical Pattern-B case (EPIC-029 Concern 3), achieved by the base `EditorModel.beforeNavigateAway` default with **no survival override**.

This deletes the bespoke splitter/width code in `TodoBody` and aligns the Todo editor with the Notebook (US-602) and Link (US-600-a) `SecondaryViews` model.

**Per the user's steer (2026-06-05):** keep it as a **single** panel (do **not** split Lists and Tags into two panels like the Notebook); the sidebar panel is labeled just **"Todo"**.

## Background

### The inline layout today

`TodoBody.tsx` renders a fixed two-pane row (`todo-root`, `direction="row"`):

| Piece | Lines | Role |
|---|---|---|
| `todo-left-panel` `Panel` (width = `state.leftPanelWidth`, min 100, max 80%) | `:145-163` | Hosts the single `TodoListPanel` |
| `TodoListPanel` (`pageModel`, `lists`, `selectedList`, `listCounts`, `tags`, `selectedTag`) | `:155-162` | **One** component: a "New list" input row, a scrollable body with a **Lists** section (`All` + each list, with counts) and a **Tags** section (`All Tags` + each tag, with color dot/rename/delete), and a "New tag" input row | 
| `Splitter` (`value={state.leftPanelWidth}`, `onChange={editor.setLeftPanelWidth}`) | `:164-171` | Resizes the left panel |
| `todo-content` `Panel` → quick-add row + `RenderFlexGrid` | `:172-256` | The center: quick-add textarea + the virtualized items list |

The left panel is **always visible** — there is no toggle; it is part of the main view. The width is editor-owned: `state.leftPanelWidth` (default 200), persisted in the HS1 host slot `host.editorSettings["todo-view"].leftPanelWidth`, set on drag by `TodoEditor.setLeftPanelWidth` (`:871-875`).

### What drives the panel

Unlike the Notebook (which has an `expandedPanel: "tags" | "categories"` active-panel concept driving a breadcrumb + active-panel-scoped filter + add-note seed), **the Todo editor has no active-panel notion**. `TodoListPanel` shows Lists and Tags **simultaneously** in one scrollable column. The two selections are independent:

- **`selectedList`** (`""` = "All") — `setSelectedList` → `applyFilters` (filter center items by list). Drives `isQuickAddDisabled` (`!selectedList`) and the `addItem` target list.
- **`selectedTag`** (`""` = "All Tags") — `setSelectedTag` → `applyFilters` (filter center items by tag).
- **`listCounts`** — per-list undone/total counts shown next to each list row (`loadListCounts`).
- List/tag CRUD: `addList`/`renameList`/`deleteList`, `addTag`/`renameTag`/`deleteTag`/`updateTagColor` — all on `TodoEditor`, called by `TodoListPanel` via its `pageModel` prop (typed `TodoSource = TodoEditor`).

There is **no breadcrumb** and **no active-panel state** to sync — so this task needs **neither** the Notebook's `_seedActivePanel` panel-ID map **nor** the `panelExpanded` body subscription. It needs only to make the **single** panel active (see "Single panel must still be seeded active" below).

`TodoListPanel` is used **only** inside the `todo/` folder, so relocating its call site into the new panel component touches nothing else.

### Reference pattern — US-602 (Notebook) and US-600-a (Link)

US-602 migrated the Notebook's two panels to always-on SecondaryViews. The mechanics this task mirrors (but with **one** panel and **no** active-panel plumbing):

1. **Register the panel in `adoptHost`**: `this.secondaryView = TODO_PANELS;` (constant for the editor's life on the page) — `NotebookEditor.adoptHost`.
2. **Seed the active panel** via a private `_seedActivePanel()` called from **both** `adoptHost` (restore path — page already set) and the `setPage` override (fresh-open path — page attached after `adoptHost`).
3. **Delete the editor-owned width** (`leftPanelWidth`); the sidebar width becomes owner-held in `ISecondaryViewsState.width`, persisted by the host (epic Concern 4).
4. **Secondary-view component shape**: default-export `({ model, headerRef }: SecondaryViewProps)`, type-guard `instanceof TodoEditor` before any hooks, portal the header title into `headerRef` via `createPortal`.
5. **Registration**: `secondaryViewRegistry.register({ id, label, loadComponent })` in `register-editors.ts`.

### Single panel must still be seeded active

`CollapsiblePanelStack` (`CollapsiblePanelStack.tsx:180`) renders a panel **open** only when `activePanel === panel.id`; otherwise it is collapsed (`data-state="closed"`, content `display:none`). So even with a **single** panel, if `state.activePanel` is `""` (its default) or `"explorer"` (when the auto-Explorer is hoisted first — Concern A), the **Todo panel would render collapsed**. Therefore `_seedActivePanel()` must call `this.page.expandPanel("todo-panel")` to make the Todo panel the active/open one. This is the same mechanism the Notebook/Link editors use to pick their active panel; for Todo it is unconditional (one panel, no map).

### Why Todo is Pattern-B (no survival logic)

Clicking a list or tag only **filters the center items list** (`setSelectedList`/`setSelectedTag` → `applyFilters`). The Todo editor never opens another file into the page's main view on its own behalf (no `promoteSecondaryToMain`, no `onMainEditorChanged`, no `isMain` reads). Therefore:

- **No survival logic.** The Todo keeps the base `EditorModel.beforeNavigateAway` (clears `secondaryView`) — so when the user opens another file in the tab, the Todo panel disappears with the editor. This **exactly** matches the user's requirement ("panel should disappear if the page is navigated to some other file"). EPIC-029 Concern 3 names this the Pattern-B base-default case — **no override needed**.

### Mandatory-open + auto-Explorer (inherited from US-600-a)

US-600-a added the generic `PageModel.sidebarMandatory` rule: *the sidebar is closeable only when the Explorer is the sole panel contributor; any non-Explorer panel makes it mandatory-open and hides the toggle/✕.* Once the Todo editor contributes `todo-panel`, the rule applies automatically — the sidebar is mandatory-open and the toolbar `NavPanelButton` is hidden. This **preserves** the "panel always visible, no toggle" behaviour with **no new code**.

US-600-a also added `PageModel._maybeAutoInitExplorer()`: when the sidebar is mandatory, no Explorer exists, and a panel-contributing editor exposes a **local-file** `getNavigatorTarget()`, the Page **auto-creates an Explorer panel** rooted at that file's folder. `TodoEditor.getNavigatorTarget()` (`:138-144`) returns `{ pipe, filePath }` for a saved `.todo.json`. So opening a **saved** Todo file will add an Explorer panel above the Todo panel — **this is the behaviour the user explicitly requested** ("the Explorer panel should be initialized if the Todo is opened from a file"). No extra code; it is inherited generically. See Concern A.

## Target design

**Invariant:** while a `TodoEditor` is the page's main editor, the `SecondaryViews` sidebar is open (mandatory) and hosts exactly `[todo-panel]`. An Explorer panel, when present (saved file — Concern A), is hoisted to the very top by `PageModel.panelEditors`; the **Todo panel is the active/expanded one** (seeded). `TodoBody` renders only the center column (quick-add row + items list) — no inline left panel, no splitter. When the page navigates away to another file, the base `beforeNavigateAway` clears `secondaryView` and the panel disappears.

**One new registered secondary view:**

| ID | Label | Renders | Source moved from |
|---|---|---|---|
| `todo-panel` | `Todo` | `<TodoListPanel pageModel lists selectedList listCounts tags selectedTag>` (Lists + Tags + add/rename/delete + colors) | `TodoBody.tsx:155-162` |

It reads the editor via `editor.state.use(...)` (the same slice `TodoBody` reads today for the panel) and portals its title string `"Todo"` into `headerRef`.

**Behaviour parity checklist (must be identical):** add a list (Enter / + button), rename a list (inline), delete a list (with confirm + item-count message), select "All" / a specific list → center filters + counts update, add a tag, rename a tag, delete a tag (with confirm), change a tag color (menu of swatches + "No color"), select "All Tags" / a specific tag → center filters, quick-add disabled when no list selected, quick-add targets the selected list (+ selected tag).

## Implementation Plan

> Order: (1) register the panel; (2) new `TodoSecondaryView`; (3) `TodoEditor` registers the panel + seeds active panel + drops `leftPanelWidth`; (4) `TodoBody` drops the inline panel + splitter + width plumbing; (5) `tsc`/`eslint`; (6) manual smoke test.

### Step 1 — Register the secondary view

`src/renderer/editors/register-editors.ts` — after the `notebook-tags` block (`:55`), add:

```ts
secondaryViewRegistry.register({
    id: "todo-panel",
    label: "Todo",
    loadComponent: () => import("./todo/panels/TodoSecondaryView"),
});
```

### Step 2 — New `TodoSecondaryView`

`src/renderer/editors/todo/panels/TodoSecondaryView.tsx` (NEW). Mirrors `NotebookTagsSecondaryView` (type-guard → inner body → portal header). The inner body reads the panel's state slice and renders the existing `TodoListPanel` verbatim:

```tsx
import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { TodoListPanel } from "../components/TodoListPanel";
import { TodoEditor } from "../TodoEditor";

export default function TodoSecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as NotebookTagsSecondaryView).
    if (!(model instanceof TodoEditor)) return null;
    return <TodoSecondaryViewBody editor={model} headerRef={headerRef} />;
}

function TodoSecondaryViewBody({
    editor,
    headerRef,
}: {
    editor: TodoEditor;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const state = editor.state.use((s) => ({
        lists: s.data.lists,
        tags: s.data.tags,
        selectedList: s.selectedList,
        selectedTag: s.selectedTag,
        listCounts: s.listCounts,
    }));
    return (
        <>
            {headerRef && createPortal(<>Todo</>, headerRef)}
            <TodoListPanel
                pageModel={editor}
                lists={state.lists}
                selectedList={state.selectedList}
                listCounts={state.listCounts}
                tags={state.tags}
                selectedTag={state.selectedTag}
            />
        </>
    );
}
```

> `TodoListPanel` already renders `<Panel ... flex={1}>` with its own internal scroll/layout, so it slots directly into the `CollapsiblePanel` content area. The outer width/background that `TodoBody`'s `todo-left-panel` used to provide now comes from the `SecondaryViews` container + splitter. No changes to `TodoListPanel` itself.

### Step 3 — `TodoEditor`: register the panel, seed active panel, drop `leftPanelWidth`

`src/renderer/editors/todo/TodoEditor.ts`:

**3a. Panel constant** — near the top (after the imports, before `isLegacyTextFileHost`), add:
```ts
// Single combined Lists+Tags panel (labeled "Todo"). Registered once in
// adoptHost, constant for the editor's life on the page. The base
// beforeNavigateAway clears it on navigate-away (Pattern-B; no survival
// override). The sidebar is mandatory-open per PageModel.sidebarMandatory.
const TODO_PANELS = ["todo-panel"];
```

**3b. Register in `adoptHost`** — right after `this._tearDownHostSubscriptions();` (`:226`), add:
```ts
this.secondaryView = TODO_PANELS;
```

**3c. Seed active panel** — at the end of `adoptHost` (after the existing `if (this.page) host.setPage(this.page);` at `:284`), add `this._seedActivePanel();`. Replace the existing `setPage` override (`:287-290`) with the version below and add the helper:

```ts
setPage(page: IPageHost | null): void {
    super.setPage(page);
    this._host?.setPage(page);
    // Fresh-open path: adoptHost ran before the page was attached, so make
    // the single Todo panel the active (expanded) one once the page is
    // present and the panel is registered.
    if (page && this.contributesPanels()) this._seedActivePanel();
}

/** Make the single Todo panel the active/expanded one. CollapsiblePanelStack
 *  collapses any panel whose id !== activePanel, so a lone panel still needs
 *  this. No-op when no page is attached. */
private _seedActivePanel(): void {
    if (!this.page) return;
    this.page.expandPanel("todo-panel");
}
```

**3d. Delete `leftPanelWidth`** (dead after Step 4 — width is now owner-held in `ISecondaryViewsState`, persisted by the host per epic Concern 4):
- `TodoViewSettings` (`:30`) — drop `leftPanelWidth?: number;`
- `TodoEditorState` (`:37`) — drop `leftPanelWidth: number;`
- `defaultTodoEditorState` (`:55`) — drop `leftPanelWidth: 200,`
- `adoptHost` HS1 seed (`:250`) — drop the `if (saved.leftPanelWidth !== undefined) s.leftPanelWidth = saved.leftPanelWidth;` line
- `adoptHost` HS1 mirror-back (`:263-269`) — drop `leftPanelWidth: s.leftPanelWidth,` from the `setEditorState` object **and** the `${s.leftPanelWidth}|` segment from the composite slice-selector key (becomes `` `${s.selectedList}|${s.selectedTag}` ``)
- `setLeftPanelWidth` method (`:871-875`) — delete

`selectedList`/`selectedTag` **stay** in the HS1 slot (still drive the filter + restore the selection). An old saved slot carrying `leftPanelWidth` is ignored on load (extra key, no reader) — no migration shim, consistent with the epic's reset-to-default stance.

Update the HS1 doc comment on `TodoViewSettings` ("the three per-window UI fields" → "the two per-window UI fields").

### Step 4 — `TodoBody`: drop the inline panel + splitter + width plumbing

`src/renderer/editors/todo/TodoBody.tsx`:

**4a. Remove** the left pane: the `todo-left-panel` `Panel` + the `TodoListPanel` it wraps (`:145-163`) and the `Splitter` (`:164-171`). The root `todo-root` `Panel` becomes `direction="column"` and its children become exactly what was inside `todo-content` (the `todo-quick-add-row` + the items area). Net: the center column is the only content.

**4b. Trim the selector** (`:19-27`) to what the center actually reads:
```ts
const pageState = editor.state.use((s) => ({
    data: s.data,
    error: s.error,
    selectedList: s.selectedList,
    filteredItems: s.filteredItems,
}));
```
(`tags` stays available as `pageState.data.tags`, used by `renderTodoCell`; `allItems` stays as `pageState.data.items`. Drop `leftPanelWidth`, `listCounts`, `selectedTag` — they were only consumed by the now-relocated `TodoListPanel`.)

**4c. Drop now-unused imports**: `Splitter`, `TodoListPanel`. Keep `Panel`, `Textarea`, `IconButton`, `RenderFlexGrid`/`RenderGridModel`/`RenderFlexCellParams`/`Percent`, `color`, `PlusIcon`, `EditorError`, `TodoItemView`, `TodoItem`, `TodoEditor`.

**No `panelExpanded` subscription** is added (Todo has no active-panel state to sync — unlike Notebook/Link).

### Step 5 — Verify
`npx tsc --noEmit` + `npx eslint` on changed files.

### Step 6 — Manual smoke test
1. **Open a `.todo.json`** → sidebar is open, **cannot** be closed (no toggle button); shows a single **Todo** panel (Explorer hoisted above it if the file is saved — Concern A); the Todo panel is **expanded** (not collapsed); center shows the quick-add row + items list. Width drag works (sidebar splitter).
2. **Lists**: add a list (Enter and + button); rename inline; delete (confirm + item-count message); select "All" / a specific list → center filters and counts update.
3. **Tags**: add a tag; rename; delete (confirm); change color via the swatch menu (incl. "No color"); select "All Tags" / a specific tag → center filters.
4. **Quick-add**: disabled (placeholder "Select a list to add items...") when no list selected; with a list selected, adding an item targets that list (+ selected tag if any).
5. **Navigate away**: open another file in the same tab → the Todo panel **disappears** with the editor (Pattern-B). Returning to the Todo tab → panel reappears, selections restored from the HS1 slot.
6. **Restart** with a Todo open → sidebar restores open; the Todo panel re-derives and is expanded; no inline panel/splitter; `selectedList`/`selectedTag` restored.
7. **Switch editor** (Todo ↔ Monaco on the same file via the switch widget) → panel appears/disappears with the Todo view; selections survive the round-trip (HS1 slot).

## Concerns / Open Questions

### Concern A — Auto-init Explorer appears in the Todo sidebar. **This is the requested behaviour.**

`PageModel._maybeAutoInitExplorer()` (US-600-a) auto-creates an Explorer panel rooted at the file's folder when the sidebar is mandatory and a panel editor exposes a local-file `getNavigatorTarget()`. `TodoEditor.getNavigatorTarget()` returns `{ pipe, filePath }` for a saved `.todo.json`, so a saved Todo's sidebar becomes `[Explorer, Todo]` (Explorer hoisted first by `PageModel.panelEditors`). **The user explicitly asked for this** ("the Explorer panel should be initialized if the Todo is opened from a file"). Unsaved Todos (`{}` target) get no Explorer. No extra code — inherited generically from US-600-a. The seeded active panel is `todo-panel`, so Explorer renders **present but collapsed**; the user can expand it by clicking its header. *(Same precedent as Notebook US-602 / Link US-600-a.)* Confirm in the smoke test that the auto-Explorer is rooted at the `.todo.json`'s folder and is not duplicated on restart.

### Concern B — Sidebar width persistence moves from editor to page. **Resolved by precedent (US-602 Concern B / US-600-a Concern 6).**

`leftPanelWidth` (editor/HS1-slot owned, per-todo-file) is deleted; the sidebar width becomes `ISecondaryViewsState.width`, owner-held and persisted by `PageModel` in its descriptor (epic Concern 4). Net change: the panel width is now **per-page**, not **per-todo-file**, and shared with whatever else uses that page's sidebar. Same trade-off accepted for Notebook and Links. An old HS1 slot carrying `leftPanelWidth` is ignored on load (no shim). Flagged only so the width-scope change is explicit.

### Concern C — Mandatory-open / no toggle. **Resolved by inherited US-600-a rule.**

Once the Todo editor contributes the panel, `PageModel.sidebarMandatory` is true → the sidebar can't be closed and the `NavPanelButton` is hidden. This **preserves** today's "always-visible, no toggle" left panel. No new code.

### Concern D — Single panel (no split). **Per the user's steer — confirmed.**

The Todo side panel stays **one** combined Lists+Tags panel labeled "Todo" (the existing `TodoListPanel`), **not** split into two panels like the Notebook's Categories/Tags. The set is always `[todo-panel]` while the Todo is on the page and **gone** when it navigates away (base `beforeNavigateAway`). No active-panel/breadcrumb state, so no `_seedActivePanel` map and no `panelExpanded` body subscription — only the unconditional `expandPanel("todo-panel")` seed so the lone panel renders expanded.

### Out of scope
- Rest Client migration — US-604.
- Any change to item rendering (`TodoItemView`), the quick-add behaviour, serialization, filtering logic, or the toolbar/footer bits (search/counts) — untouched.
- `secondary-views.md` doc drift — epic close-out **US-607**.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [ ] Opening a `.todo.json` shows the sidebar open and **non-closeable** (no toggle button), hosting a single **Todo** panel that is **expanded** (Explorer hoisted above it when the file is saved); `TodoBody` renders **no** inline left `Panel`/`Splitter`.
- [ ] Lists: add / rename / delete (with confirm) / select-to-filter and counts behave **identically** to today.
- [ ] Tags: add / rename / delete (with confirm) / color change / select-to-filter behave **identically** to today.
- [ ] Quick-add: disabled with no list selected; targets the selected list (+ tag) otherwise — **identical** to today.
- [ ] Navigating the page away from the Todo **drops** the panel (Pattern-B); returning restores it with selections from the HS1 slot.
- [ ] Restart restores the sidebar open with the panel re-derived and expanded; no inline panel.
- [ ] Opening a saved `.todo.json` initializes an Explorer panel rooted at the file's folder (Concern A — the requested behaviour).

## Files Changed (summary — projected)

| Area | File | Change |
|---|---|---|
| Register panel | `editors/register-editors.ts` | add `todo-panel` registration (label "Todo") |
| Todo view | `editors/todo/panels/TodoSecondaryView.tsx` | **NEW** — wraps `TodoListPanel`, moved from `TodoBody`; portal "Todo" header |
| Editor | `editors/todo/TodoEditor.ts` | `TODO_PANELS` const; `secondaryView = TODO_PANELS` in `adoptHost`; `_seedActivePanel()` + `setPage` augmentation; **delete** `leftPanelWidth` (state + default + HS1 slot + seed + mirror key + `setLeftPanelWidth`) |
| Main view | `editors/todo/TodoBody.tsx` | remove inline left `Panel` + `TodoListPanel` + `Splitter`; trim the state selector; drop now-unused imports |
| Dashboard | `doc/active-work.md` | link US-603 to this doc |
| Epic doc | `doc/epics/EPIC-029.md` | mark US-603 row investigated + note single-panel + Concern A |

**Explicitly NOT changed:** `SecondaryViews.tsx` / `SecondaryViewsModel.ts` (already host-agnostic); `PageModel` (`sidebarMandatory` + auto-Explorer rules from US-600-a already cover Todo generically); `TodoListPanel.tsx` (reused as-is by the new panel component); `TodoItemView.tsx`; `TodoEditor` data/CRUD/serialize/filter internals; `todo/index.tsx` toolbar/footer bits (search/counts).
