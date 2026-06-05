# US-602: Notebook → `SecondaryViews`

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 3 · **Status:** ✅ Implemented (2026-06-05) — Steps 1–6 done exactly per plan (no deviations); `npx tsc --noEmit` + `eslint` clean. Awaiting manual smoke test (Step 7). Per the epic deferred-review model, stays `[ ]` on the dashboard until US-607 close-out.

## Goal

Move the Notebook's two left-panel views — **Categories** (a category tree) and **Tags** (a tag list) — out of the inline `CollapsiblePanelStack` rendered inside `NotebookBody`, and re-implement them as registered **SecondaryViews** (`notebook-categories`, `notebook-tags`). Behaviour is **unchanged**: same tree, same tag list, same filtering, same drag-and-drop, same breadcrumb. The panels are present **only while the Notebook is the page's main editor** and **drop when the page navigates away** to another file — the canonical Pattern-B case (EPIC-029 Concern 3), achieved by the base `EditorModel.beforeNavigateAway` default with **no survival override**.

This deletes the bespoke splitter/width code in `NotebookBody` and aligns the Notebook with the Link editor's `SecondaryViews` model (US-600-a).

## Background

### The inline layout today

`NotebookBody.tsx` renders a fixed two-pane row (`notebook-body`):

| Piece | Lines | Role |
|---|---|---|
| `notebook-left-panel` `Panel` (width = `state.leftPanelWidth`, min 100, max 80%) | `:150-200` | Hosts the `CollapsiblePanelStack` |
| `CollapsiblePanelStack` (`activePanel={state.expandedPanel}`, `setActivePanel={editor.setExpandedPanel}`) | `:159-199` | Two collapsible panels |
| `CollapsiblePanel id="tags"` → `<TagsListView>` | `:165-172` | Tag list (filter) |
| `CollapsiblePanel id="categories"` → `<Tree<CategoryItem>>` | `:173-198` | Category tree (filter + drag/drop) |
| `Splitter` (`value={state.leftPanelWidth}`, `onChange={handleSplitterChange}`) | `:201-208` | Resizes the left panel |
| `notebook-notes-list` `Panel` → `RenderFlexGrid` | `:209-257` | The center notes list |
| `ExpandedNoteView` portal | `:259-268` | Expanded-note overlay (portals into `editor.host.editorOverlayRef`) |

The left panel is **always visible** — there is no toggle; it is part of the main view. The width is editor-owned: `state.leftPanelWidth` (default 200), persisted in the HS1 host slot `host.editorSettings["notebook-view"].leftPanelWidth`, clamped on drag by `handleSplitterChange` (`:60-68`) and floored by `NotebookEditor.setLeftPanelWidth` (`:490-498`).

### What drives the two panels

- **`expandedPanel`** (`"tags" | "categories"`, default `"categories"`) — the active panel. Drives (a) which filter applies (`applyFilters` reads `expandedPanel` at `NotebookEditor.ts:636/642`), (b) the toolbar breadcrumb (`index.tsx` `NotebookBreadcrumb` `:17-42`), (c) the new-note seed (`addNote` `:450-461` seeds category vs. tag from the active panel). Today it is set by the `CollapsiblePanelStack` via `editor.setExpandedPanel` (`NotebookEditor.ts:500-506`, which also re-applies filters).
- **Categories panel**: tree built by `buildCategoryTreeItems(state.categories, editor.getCategorySize)` (`category-tree.tsx`); `isSelected` = `item.category === selectedCategory`; `onChange` → `editor.categoryItemClick` → `setSelectedCategory` + `applyFilters`; trait drag/drop (`TraitTypeId.NotebookCategory`, accepts `Note`/`NotebookCategory`/`LINK`) → `editor.categoryTraitDrop`; `defaultExpandAll`.
- **Tags panel**: `<TagsListView tags selectedTag onChange={editor.setSelectedTag} getCount={editor.getTagSize}>`.

`TagsListView` and `buildCategoryTreeItems`/`CategoryItem` are used **only** inside the `notebook/` folder (confirmed by grep), so relocating their call sites into the new panel components touches nothing else.

### Reference pattern — US-600-a (Link editor)

US-600-a migrated the Link editor's three panels to always-on SecondaryViews. The mechanics this task mirrors:

1. **Register panels in `adoptHost`**: `this.secondaryView = NOTEBOOK_PANELS;` (constant for the editor's life on the page) — `LinkEditor.ts:303`.
2. **Seed the active panel** from the saved `expandedPanel` via a private `_seedActivePanel()` called from **both** `adoptHost` (restore path — page already set) and the `setPage` override (fresh-open path — page attached after `adoptHost`) — `LinkEditor.ts:369/372-379/384-392`.
3. **`panelExpanded` subscription in the body** maps sidebar panel IDs → `expandedPanel` state — `LinkBody.tsx:29-44`.
4. **Delete the editor-owned width** (`leftPanelWidth`); the sidebar width becomes owner-held in `ISecondaryViewsState.width`, persisted by the host (epic Concern 4) — US-600-a Concern 6.
5. **Secondary-view component shape**: default-export `({ model, headerRef }: SecondaryViewProps)`, type-guard `instanceof NotebookEditor` before any hooks, portal the header title into `headerRef` via `createPortal` — `LinkCategorySecondaryView.tsx`, `LinkTagsSecondaryView.tsx`.
6. **Registration**: `secondaryViewRegistry.register({ id, label, loadComponent })` in `register-editors.ts:9-43`.

### Why Notebook is simpler than Links (Pattern-B)

The Link editor opens links into the page's main view and must **survive** as a sidebar panel while a file is shown (`beforeNavigateAway` keeps panels via `_isOpenedFromMe`; `onMainEditorChanged`; `promoteSecondaryToMain`; derived `isMain`). **The Notebook does none of this.** Clicking a category or tag only **filters the center notes list** (`setSelectedCategory`/`setSelectedTag` → `applyFilters`). A note opens **inline** (`ExpandedNoteView` portals into the editor overlay — `NotebookBody.tsx:259-268`); the page never navigates to another file on the Notebook's behalf. Therefore:

- **No survival logic.** The Notebook keeps the base `EditorModel.beforeNavigateAway` (clears `secondaryView`) — so when the user opens another file in the tab, the Categories/Tags panels disappear with the editor. This **exactly** matches the user's requirement ("panels only needed when Notebook is in main page view"). EPIC-029 Concern 3 names this the Pattern-B base-default case — **no override needed**.
- **No `promoteSecondaryToMain` / `isMain` / `onMainEditorChanged` reads** in the panels. The category click stays a pure filter.

### Mandatory-open + auto-Explorer (inherited from US-600-a) — see Concern A

US-600-a added the generic `PageModel.sidebarMandatory` rule: *the sidebar is closeable only when the Explorer is the sole panel contributor; any non-Explorer panel makes it mandatory-open and hides the toggle/✕.* Once the Notebook contributes `notebook-categories`/`notebook-tags`, the rule applies automatically — the sidebar is mandatory-open and the toolbar `NavPanelButton` is hidden. This **preserves** the "panel always visible, no toggle" behaviour with **no new code**. US-600-a's notes explicitly anticipated this: *"Todo/Notebook don't contribute panels until Phase 3 → excluded for now, auto-covered when they migrate."* The one behavioural ripple this creates (auto-init Explorer) is **Concern A** below.

## Target design

**Invariant:** while a `NotebookEditor` is the page's main editor, the `SecondaryViews` sidebar is open (mandatory) and hosts exactly `[notebook-categories, notebook-tags]` (Categories first — Concern E). An Explorer panel, when present (Concern A), is hoisted to the very top by `PageModel.panelEditors` regardless of this array. `NotebookBody` renders only the center notes list + the expanded-note overlay portal — no inline panel stack, no splitter. When the page navigates away to another file, the base `beforeNavigateAway` clears `secondaryView` and the panels disappear.

**Two new registered secondary views:**

| ID | Label | Renders | Source moved from |
|---|---|---|---|
| `notebook-categories` | `Categories` | `<Tree<CategoryItem>>` (filter + trait drag/drop, `defaultExpandAll`) | `NotebookBody.tsx:173-198` |
| `notebook-tags` | `Tags` | `<TagsListView tags value={selectedTag} onChange={setSelectedTag} getCount={getTagSize}>` | `NotebookBody.tsx:165-172` |

Both read the editor via `editor.state.use(...)` (the same hook `NotebookBody` uses) and portal their title string into `headerRef`.

**Behaviour parity checklist (must be identical):** category-tree expand/collapse, `defaultExpandAll`, selection highlight, category click → filter, tag drill-down + selection → filter, drag a note onto a category, drag a category onto another (move sub-tree), drop a `LINK` onto a category (create note), breadcrumb reflects the active panel, "Add Note" seeds category/tag from the active panel + selection, search filters within the active panel's scope.

## Implementation Plan

> Order: (1) register the two panels; (2) new `NotebookCategoriesSecondaryView`; (3) new `NotebookTagsSecondaryView`; (4) `NotebookEditor` registers panels + seeds active panel + drops `leftPanelWidth`; (5) `NotebookBody` drops the inline stack + adds the `panelExpanded` sync; (6) `tsc`/`eslint`; (7) manual smoke test.

### Step 1 — Register the two secondary views

`src/renderer/editors/register-editors.ts` — after the `link-hostnames` block (`:43`), add:

```ts
secondaryViewRegistry.register({
    id: "notebook-tags",
    label: "Tags",
    loadComponent: () => import("./notebook/panels/NotebookTagsSecondaryView"),
});

secondaryViewRegistry.register({
    id: "notebook-categories",
    label: "Categories",
    loadComponent: () => import("./notebook/panels/NotebookCategoriesSecondaryView"),
});
```

### Step 2 — New `NotebookCategoriesSecondaryView`

`src/renderer/editors/notebook/panels/NotebookCategoriesSecondaryView.tsx` (NEW). Mirrors `LinkCategorySecondaryView` (type-guard → inner body → portal header). Moves the category-tree block + its three callbacks verbatim out of `NotebookBody`:

```tsx
import { useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { Panel } from "../../../uikit/Panel";
import { Tree } from "../../../uikit/Tree";
import { TraitTypeId, type TraitDragPayload, resolveTraits } from "../../../core/traits";
import { LINK } from "../../link-editor/linkTraits";
import { buildCategoryTreeItems, type CategoryItem } from "../category-tree";
import { NotebookEditor } from "../NotebookEditor";

export default function NotebookCategoriesSecondaryView({ model, headerRef }: SecondaryViewProps) {
    if (!(model instanceof NotebookEditor)) return null;
    return <NotebookCategoriesBody editor={model} headerRef={headerRef} />;
}

function NotebookCategoriesBody({
    editor,
    headerRef,
}: {
    editor: NotebookEditor;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const state = editor.state.use((s) => ({
        categories: s.categories,
        categoriesSize: s.categoriesSize,
        selectedCategory: s.selectedCategory,
    }));

    const categoryTreeItems = useMemo<CategoryItem[]>(
        () => buildCategoryTreeItems(state.categories, editor.getCategorySize),
        // eslint-disable-next-line react-hooks/exhaustive-deps -- categoriesSize read via editor.getCategorySize; needed to rebuild on size change
        [state.categories, state.categoriesSize, editor],
    );

    const isCategorySelected = useCallback(
        (item: CategoryItem) => item.category === state.selectedCategory,
        [state.selectedCategory],
    );

    const canCategoryTraitDrop = useCallback(
        (_dropItem: CategoryItem, payload: TraitDragPayload) => {
            if (payload.typeId === TraitTypeId.Note) return true;
            if (payload.typeId === TraitTypeId.NotebookCategory) return true;
            const traits = resolveTraits(payload.typeId);
            return !!traits?.get(LINK);
        },
        [],
    );

    return (
        <>
            {headerRef && createPortal(<>Categories</>, headerRef)}
            <Panel
                name="notebook-categories-pane"
                direction="column"
                flex={1}
                overflow="hidden"
                paddingLeft="sm"
            >
                <Tree<CategoryItem>
                    name="notebook-categories-tree"
                    items={categoryTreeItems}
                    isSelected={isCategorySelected}
                    onChange={(item) => editor.categoryItemClick(item)}
                    traitTypeId={TraitTypeId.NotebookCategory}
                    getDragData={(item) => editor.getCategoryDragData(item)}
                    acceptsDrop
                    canTraitDrop={(target, payload) => canCategoryTraitDrop(target, payload)}
                    onTraitDrop={(target, payload) => editor.categoryTraitDrop(target, payload)}
                    defaultExpandAll
                />
            </Panel>
        </>
    );
}
```

> **Tree-expansion bug (US-601) does NOT apply here.** The US-601 fix was for `LinkTreeProvider.watch` over-firing on selection. The Notebook category tree is built directly via `buildCategoryTreeItems` in a `useMemo` keyed on `[categories, categoriesSize, editor]` — **not** on `selectedCategory`. Selecting a category changes `isCategorySelected`'s identity (re-render) but leaves the `items` array reference stable, so the virtualized tree never loses its expansion state on a label click. No watch/refresh wiring to port; no fix needed. (Verify in smoke test anyway.)

### Step 3 — New `NotebookTagsSecondaryView`

`src/renderer/editors/notebook/panels/NotebookTagsSecondaryView.tsx` (NEW):

```tsx
import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { TagsListView } from "../TagsListView";
import { NotebookEditor } from "../NotebookEditor";

export default function NotebookTagsSecondaryView({ model, headerRef }: SecondaryViewProps) {
    if (!(model instanceof NotebookEditor)) return null;
    return <NotebookTagsBody editor={model} headerRef={headerRef} />;
}

function NotebookTagsBody({
    editor,
    headerRef,
}: {
    editor: NotebookEditor;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const state = editor.state.use((s) => ({ tags: s.tags, selectedTag: s.selectedTag }));
    return (
        <>
            {headerRef && createPortal(<>Tags</>, headerRef)}
            <TagsListView
                tags={state.tags}
                value={state.selectedTag}
                onChange={editor.setSelectedTag}
                getCount={editor.getTagSize}
            />
        </>
    );
}
```

### Step 4 — `NotebookEditor`: register panels, seed active panel, drop `leftPanelWidth`

`src/renderer/editors/notebook/NotebookEditor.ts`:

**4a. Panel constant + import** — near the top (after the imports / before the class), add:
```ts
const NOTEBOOK_PANELS = ["notebook-categories", "notebook-tags"];
```
(Order: Categories first, Tags second — Concern E. This array order is what `SecondaryViews` renders; an Explorer panel, if present, is hoisted above both by `PageModel.panelEditors`.)

**4b. Register in `adoptHost`** — at the start of `adoptHost` (`:300-302`, right after `this._host = host;` / `_tearDownHostSubscriptions()`), add:
```ts
// Panels are a property of "the Notebook is on a page" — registered once
// here, constant for the editor's life. The base beforeNavigateAway clears
// them on navigate-away (Pattern-B; no survival override). The sidebar is
// mandatory-open per PageModel.sidebarMandatory.
this.secondaryView = NOTEBOOK_PANELS;
```

**4c. Seed active panel** — at the end of `adoptHost` (after the existing `if (this.page) host.setPage(this.page);` at `:375`), add `this._seedActivePanel();`. Add the helper + a `setPage` augmentation:

```ts
setPage(page: IPageHost | null): void {
    super.setPage(page);
    this._host?.setPage(page);
    // Fresh-open path: adoptHost ran before the page was attached, so seed
    // the active panel once the page is present and panels are registered.
    if (page && this.contributesPanels()) this._seedActivePanel();
}

/** Map the saved `expandedPanel` to its sidebar panel ID and make it active.
 *  No-op when no page is attached or the panel isn't registered. */
private _seedActivePanel(): void {
    if (!this.page) return;
    const map: Record<ExpandedPanel, string> = {
        tags: "notebook-tags",
        categories: "notebook-categories",
    };
    this.page.expandPanel(map[this.state.get().expandedPanel] ?? "notebook-categories");
}
```
(The existing `setPage` override at `:378-381` is replaced by the version above.)

**4d. Delete `leftPanelWidth`** (dead after Step 5 — width is now owner-held in `ISecondaryViewsState`, persisted by the host per epic Concern 4):
- `NotebookViewSettings` (`:34`) — drop `leftPanelWidth?: number;`
- `NotebookEditorState` (`:42`) — drop `leftPanelWidth: number;`
- `defaultNotebookEditorState` (`:66`) — drop `leftPanelWidth: 200,`
- `adoptHost` HS1 seed (`:325-330`) — drop the `if (saved.leftPanelWidth …) s.leftPanelWidth = …` block
- `adoptHost` HS1 mirror-back (`:350-358`) — drop `leftPanelWidth: s.leftPanelWidth,` from the `setEditorState` object **and** the `${s.leftPanelWidth}|` segment from the composite slice-selector key (becomes `` `${s.expandedPanel}|${s.selectedCategory}|${s.selectedTag}` ``)
- `setLeftPanelWidth` method (`:490-498`) — delete

`expandedPanel`/`selectedCategory`/`selectedTag` **stay** in the HS1 slot (still drive the active panel + breadcrumb + filter). An old saved slot carrying `leftPanelWidth` is ignored on load (extra key, no reader) — no migration shim, consistent with the epic's reset-to-default stance.

`setExpandedPanel` (`:500-506`) **stays** — it is now called by the `panelExpanded` subscription in `NotebookBody` (Step 5) instead of the inline `CollapsiblePanelStack`; it still re-applies filters.

### Step 5 — `NotebookBody`: drop the inline stack, add the `panelExpanded` sync

`src/renderer/editors/notebook/NotebookBody.tsx`:

**5a. Remove** the entire left pane: the `notebook-left-panel` `Panel` + `CollapsiblePanelStack` + both `CollapsiblePanel`s (`:150-200`) and the `Splitter` (`:201-208`). The body becomes a single column — the `notebook-notes-list` `Panel` (`:209-257`) is the only child of `notebook-body` (keep the `HighlightedTextProvider` wrapper). Keep the `ExpandedNoteView` portal (`:259-268`).

**5b. Remove** the width plumbing: `bodyRef` (`:59`) + `handleSplitterChange` (`:60-68`) + `leftPanelWidth` from the `editor.state.use` selector (`:30`). The `notebook-body` `Panel` no longer needs `ref={bodyRef}` (keep `direction="row"`→ change to `direction="column"` since the left pane is gone, or keep the single notes panel as `flex={1}` — net: `notebook-body` wraps just the notes column).

**5c. Add** the `panelExpanded` subscription (mirror `LinkBody.tsx:29-44`). Read `const pageId = editor.page?.id;` and:
```tsx
useEffect(() => {
    if (!pageId) return;
    const sub = panelExpanded.subscribe((event) => {
        if (event?.pageId !== pageId) return;
        const map: Record<string, string> = {
            "notebook-categories": "categories",
            "notebook-tags": "tags",
        };
        const expanded = map[event.panelId];
        if (expanded) editor.setExpandedPanel(expanded);
    });
    return () => sub.unsubscribe();
}, [pageId, editor]);
```
Import `panelExpanded` from `../../core/state/events`.

**5d. Drop now-unused imports**: `CollapsiblePanel`, `CollapsiblePanelStack`, `Splitter`, `Tree`, `TagsListView`, `buildCategoryTreeItems`/`CategoryItem`, `TraitTypeId`/`TraitDragPayload`/`resolveTraits`, `LINK`. Keep `Panel`, `Text`, `HighlightedTextProvider`, `RenderFlexGrid`/`RenderGridModel`/`RenderFlexCellParams`/`Percent`, `NoteItemView`, `ExpandedNoteView`, `createPortal`, `NotebookEditor`. Also remove the now-dead `categoryTreeItems`/`isCategorySelected`/`canCategoryTraitDrop` memos/callbacks (`:113-131`) and the `state.categories`/`categoriesSize`/`selectedCategory`/`tags`/`selectedTag` reads from the selector if no longer used by the center list — **keep** any the center list still needs (`NoteItemView` receives `categories`/`tags` at `:88-89`, so keep `categories` + `tags` in the selector; drop `categoriesSize`, `selectedCategory`, `selectedTag`, `leftPanelWidth`, `expandedPanel` if unused by the center list — verify `expandedPanel` isn't read elsewhere in the body).

### Step 6 — Verify
`npx tsc --noEmit` + `npx eslint` on changed files.

### Step 7 — Manual smoke test
1. **Open a `.note.json`** → sidebar is open, **cannot** be closed (no toggle button); shows **Categories** then **Tags** panels (Explorer above both if the file is saved — Concern A); center shows the notes list. Width drag works (sidebar splitter).
2. **Categories panel**: tree expands/collapses (incl. `defaultExpandAll` on open); clicking a category filters the center list + updates the breadcrumb; expansion is **not** lost on label click (US-601 bug must not reproduce here).
3. **Tags panel**: drill into a parent tag, select a sub-tag → center list filters; breadcrumb shows the tag path.
4. **Drag/drop**: drag a note onto a category (moves it); drag a category onto another (moves the sub-tree, with confirm); drag a link (from a Link editor/list) onto a category (creates a note).
5. **Add Note** while a category/tag is selected → the new note inherits it (active-panel-aware seed).
6. **Navigate away**: open another file in the same tab (or via Explorer) → the Tags/Categories panels **disappear** with the Notebook (Pattern-B). Returning to the Notebook tab → panels reappear, active panel + selection restored from the HS1 slot.
7. **Restart** with a Notebook open → sidebar restores open; panels re-derive; no inline stack; active panel = last `expandedPanel`.
8. **Expanded note**: expand a note → the overlay still renders (portal into the editor overlay) and the sidebar stays put.

## Concerns / Open Questions

### Concern A — Auto-init Explorer appears in the Notebook sidebar (behaviour ripple). **RESOLVED (user, 2026-06-05): accept it.**

US-600-a added `PageModel._maybeAutoInitExplorer()`: when the sidebar is mandatory, no Explorer exists, and a panel-contributing editor exposes a **local-file** `getNavigatorTarget()`, the Page **auto-creates an Explorer panel** rooted at that file's folder. `NotebookEditor.getNavigatorTarget()` (`:208-214`) returns `{ pipe, filePath }` for a saved `.note.json`. So after this task, **opening a saved Notebook will add an Explorer panel** to its sidebar alongside Tags + Categories (sidebar = `[Explorer, Tags, Categories]`, Explorer sorted first).

- Today a Notebook page has **no** Explorer in view by default (the inline stack is only Tags + Categories; the Explorer was reachable only via the now-hidden nav toggle).
- This is **consistent with the Link editor** (Links get the auto-Explorer too) and gives Notebook users file navigation for free, but it **is** a new panel the user didn't have before — strictly, a behaviour change beyond "move the panels."
- Unsaved notebooks (`{}` target) get no Explorer.

**Decision (user, 2026-06-05): accept (option a)** — a saved Notebook's sidebar becomes `[Explorer, Tags, Categories]`, matching the Link precedent; unsaved notebooks (`{}` target) get no Explorer. No extra code (the US-600-a auto-init already covers Notebook generically). Confirm in the smoke test that the auto-Explorer is rooted at the `.note.json`'s folder and is not duplicated on restart.

### Concern B — Sidebar width persistence moves from editor to page. **Resolved by precedent (US-600-a Concern 6).**

`leftPanelWidth` (editor/HS1-slot owned, per-notebook) is deleted; the sidebar width becomes `ISecondaryViewsState.width`, owner-held and persisted by `PageModel` in its descriptor (epic Concern 4). Net change: the panel width is now **per-page**, not **per-notebook-file**, and shared with whatever else uses that page's sidebar. This is the same trade-off accepted for Links. An old HS1 slot carrying `leftPanelWidth` is ignored on load (no shim). No open question — flagged only so the width-scope change is explicit.

### Concern C — Mandatory-open / no toggle. **Resolved by inherited US-600-a rule.**

Once the Notebook contributes panels, `PageModel.sidebarMandatory` is true → the sidebar can't be closed and the `NavPanelButton` is hidden (US-600-a Step 6). This **preserves** today's "always-visible, no toggle" left panel. No new code.

### Concern D — Panel **set** is binary (all or gone). **Matches the user's requirement.**

The set is always `[notebook-categories, notebook-tags]` while the Notebook is on the page, and **gone** when it navigates away (base `beforeNavigateAway` clears `secondaryView`). There is no partial/reshape state. This is exactly "panels only when the Notebook is in main page view."

### Concern E — Panel ordering. **RESOLVED (user, 2026-06-05): Categories first, then Tags.**

`NOTEBOOK_PANELS = ["notebook-categories", "notebook-tags"]` — Categories above Tags (a deliberate change from today's inline stack, which listed Tags first). This also matches the default active panel (`expandedPanel: "categories"`), so Categories is both first **and** the one expanded on first open. An **Explorer** panel, when present (Concern A), is rendered above both — `PageModel.panelEditors` hoists the Explorer to the front regardless of any editor's `secondaryView` array, so no special handling is needed here.

### Out of scope
- Todo / Rest Client migrations — US-603 / US-604.
- Any change to note rendering, the expanded-note overlay, serialization, or the toolbar bits (breadcrumb/search/Add-Note) — untouched.
- `secondary-views.md` doc drift — epic close-out **US-607**.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [ ] Opening a `.note.json` shows the sidebar open and **non-closeable** (no toggle button), hosting **Categories** then **Tags** (Explorer hoisted above both when the file is saved); `NotebookBody` renders **no** inline `CollapsiblePanelStack`/`Splitter`.
- [ ] Category tree: expand/collapse, `defaultExpandAll`, selection highlight, click-to-filter, and all three drag/drop interactions (note→category, category→category, link→category) behave **identically** to today; expansion is not lost on label click.
- [ ] Tags panel: drill-down, selection-to-filter, and counts behave **identically** to today; breadcrumb reflects the active panel.
- [ ] "Add Note" still seeds category/tag from the active panel + current selection.
- [ ] Navigating the page away from the Notebook **drops** the panels (Pattern-B); returning restores them with the active panel + selection from the HS1 slot.
- [ ] Restart restores the sidebar open with the panels re-derived; no inline stack.
- [ ] Concern A resolved per the user's decision.

## Files Changed (summary — projected)

| Area | File | Change |
|---|---|---|
| Register panels | `editors/register-editors.ts` | add `notebook-tags` + `notebook-categories` registrations |
| Categories view | `editors/notebook/panels/NotebookCategoriesSecondaryView.tsx` | **NEW** — category `Tree` + drag/drop, moved from `NotebookBody`; portal "Categories" header |
| Tags view | `editors/notebook/panels/NotebookTagsSecondaryView.tsx` | **NEW** — `TagsListView`, moved from `NotebookBody`; portal "Tags" header |
| Editor | `editors/notebook/NotebookEditor.ts` | `NOTEBOOK_PANELS` const; `secondaryView = NOTEBOOK_PANELS` in `adoptHost`; `_seedActivePanel()` + `setPage` augmentation; **delete** `leftPanelWidth` (state + default + HS1 slot + seed + mirror key + `setLeftPanelWidth`) |
| Main view | `editors/notebook/NotebookBody.tsx` | remove inline `CollapsiblePanelStack` + `Splitter` + left `Panel` + width plumbing (`bodyRef`/`handleSplitterChange`); add `panelExpanded` → `setExpandedPanel` sync; drop now-unused imports/memos |
| Dashboard | `doc/active-work.md` | link US-602 to this doc |
| Epic doc | `doc/epics/EPIC-029.md` | mark US-602 row investigated + note Concern A |

**Explicitly NOT changed:** `SecondaryViews.tsx` / `SecondaryViewsModel.ts` (already host-agnostic); `PageModel` (the `sidebarMandatory` + auto-Explorer rules from US-600-a already cover Notebook generically); `TagsListView.tsx` / `category-tree.tsx` (reused as-is by the new panel components); `NotebookEditor` data/CRUD/serialize/filter internals; `notebook/index.tsx` toolbar bits (breadcrumb/search/Add-Note/footer); the expanded-note overlay.
