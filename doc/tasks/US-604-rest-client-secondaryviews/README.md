# US-604: Rest Client → `SecondaryViews`

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 3 · **Status:** 📝 Investigated — plan + concerns ready for review. Not yet implemented. Per the epic deferred-review model, stays `[ ]` on the dashboard until US-607 close-out.

## Goal

Move the Rest Client editor's left side panel — today a **single** `RequestTree` (collections → requests, rendered inline in `RestClientBody`) — out of the bespoke `<Panel>`+`<Splitter>` layout and re-implement it as **one** registered SecondaryView (`rest-panel`), with the panel header labeled **"Rest"**.

**Pure relocation — no functional changes** (user steer, 2026-06-05): the `RequestTree` moves into the secondary view **exactly as it is today**, including its in-tree **"REQUESTS" root node** and the root node's **"+" add-request button**. Nothing about the tree, its root node, its drag-and-drop, or its context menus changes. The only new chrome is the panel header title "Rest" (portaled into `headerRef`).

The panel is present **only while the Rest Client editor is the page's main editor** and **drops when the page navigates away** to another file — the canonical Pattern-B case (EPIC-029 Concern 3), achieved by the base `EditorModel.beforeNavigateAway` default with **no survival override**.

This deletes the bespoke splitter/width code in `RestClientBody` and aligns the Rest Client editor with the Notebook (US-602), Todo (US-603), and Link (US-600-a) `SecondaryViews` model.

> **Note on the two labels:** the panel header will read "Rest" while the tree's root row still reads "REQUESTS" (with the "+"). This is intentional per the user steer — the tree is moved untouched, and "Rest" names the sidebar panel.

## Background

### The inline layout today

`RestClientBody.tsx` renders a fixed two-pane row (`rest-client-root`, `direction="row"`):

| Piece | Lines | Role |
|---|---|---|
| `rest-left-panel` `Panel` (width = `leftPanelWidth`, min 150, max 80%) | `:71-90` | Hosts `rest-left-tree` → `RequestTree` |
| `RequestTree` (`vm`, `items`, `selectedId`) | `:88` | The collections/requests tree. Its **root node** renders a "REQUESTS" uppercased label + a "+" add button; collections group requests; clicking a request → `vm.selectRequest(id)` |
| `Splitter` (`value={leftPanelWidth}`, `onChange` → local mirror + `editor.setLeftPanelWidth`) | `:91-100` | Resizes the left panel |
| `rest-right-panel` `Panel` → `SplitDetailPanel` or empty message | `:101-125` | The center: request builder (top) + response viewer (bottom), split by their own horizontal splitter |

The left panel is **always visible** — there is no toggle; it is part of the main view. The width is editor-owned: `state.leftPanelWidth` (default 250), persisted in the HS1 host slot `host.editorSettings["rest-client"].leftPanelWidth`, mirrored locally for splitter smoothness (`RestClientBody.tsx:30-36`) and set by `RestClientEditor.setLeftPanelWidth` (`:940-946`).

### The tree items (built in the body — moves verbatim to the panel)

`RestClientBody` wraps the grouped collections in a synthetic root item:

```ts
const rootItem = useMemo<RequestTreeItem>(() => ({
    id: "__root__",
    isRoot: true,
    items: buildGroupedTree(state.data.requests),
}), [state.data.requests]);
const tItems = useMemo(() => traited([rootItem], requestTreeItemTraits), [rootItem]);
```

`RequestTree.renderItem` (`RestClientShared.tsx:496-533`) special-cases `item.isRoot` to render the **"REQUESTS"** label + the **"+"** add button (`vm.addRequest()`). **This is retained unchanged** — the `rootItem`/`tItems` construction moves verbatim into the new secondary view, and `RestClientShared.tsx` is **not modified at all**.

### What drives the panel

Like the Todo editor (and unlike the Notebook), the Rest Client has **no active-panel notion**. `RequestTree` shows collections + requests in one tree. The single selection is:

- **`selectedRequestId`** — `selectRequest(id)` sets it (+ restores the cached response for that request) → drives which request `SplitDetailPanel` shows in the center. Persisted in the HS1 slot.
- Request/collection CRUD: `addRequest` / `deleteRequest` / `renameRequest` / `updateRequestCollection` / `deleteCollection` / `moveRequest` / `updateRequest` — all on `RestClientEditor`, called by `RequestTree` via its `vm` prop (typed `RestClientSource = RestClientEditor`).

There is **no breadcrumb** and **no active-panel state** to sync — so this task needs **neither** a `_seedActivePanel` panel-ID map **nor** a `panelExpanded` body subscription. It needs only to make the **single** panel active (see "Single panel must still be seeded active").

`RequestTree`, `buildGroupedTree`, `requestTreeItemTraits`, and `SplitDetailPanel` are exported from `RestClientShared.tsx` but consumed **only** by `RestClientBody.tsx` — relocating the tree call site touches nothing else.

### Reference pattern — US-603 (Todo) and US-602 (Notebook)

Todo (US-603, implemented) is the closest precedent: a single combined panel, no active-panel plumbing, Pattern-B, mandatory-open + auto-Explorer inherited. The mechanics this task mirrors:

1. **Register the panel in `adoptHost`**: `this.secondaryView = REST_PANELS;` (constant for the editor's life on the page) — `TodoEditor.adoptHost:231`.
2. **Seed the active panel** via a private `_seedActivePanel()` called from **both** `adoptHost` (restore path — page already set) and the `setPage` override (fresh-open path — page attached after `adoptHost`) — `TodoEditor:288,297,303-306`.
3. **Delete the editor-owned width** (`leftPanelWidth`); the sidebar width becomes owner-held in `ISecondaryViewsState.width`, persisted by the host (epic Concern 4).
4. **Secondary-view component shape**: default-export `({ model, headerRef }: SecondaryViewProps)`, type-guard `instanceof RestClientEditor` before any hooks, portal the header title "Rest" into `headerRef` via `createPortal` — same as `TodoSecondaryView` / `NotebookCategoriesSecondaryView`.
5. **Registration**: `secondaryViewRegistry.register({ id, label, loadComponent })` in `register-editors.ts`.

### Single panel must still be seeded active

`CollapsiblePanelStack` (`CollapsiblePanelStack.tsx:180`) renders a panel **open** only when `activePanel === panel.id`; otherwise it is collapsed (`data-state="closed"`, content `display:none`). So even with a **single** panel, if `state.activePanel` is `""` (default) or `"explorer"` (when the auto-Explorer is hoisted first — Concern A), the **Rest panel would render collapsed**. Therefore `_seedActivePanel()` must call `this.page.expandPanel("rest-panel")`. Same mechanism Todo uses; unconditional (one panel, no map).

### Why Rest Client is Pattern-B (no survival logic)

Clicking a request only **changes the center detail pane** (`selectRequest` → `selectedRequestId`). The "Open in New Editor" context-menu action opens a **new page** (`app.pages.addEditorPage(...)`) — it never swaps the current page's main editor. The Rest Client never reads `isMain`, has no `promoteSecondaryToMain`, no `onMainEditorChanged`. Therefore:

- **No survival logic.** The Rest Client keeps the base `EditorModel.beforeNavigateAway` (clears `secondaryView`) — so when the user opens another file in the tab, the Rest panel disappears with the editor. This **exactly** matches the user's requirement ("panel disappears when the page navigates to another file"). EPIC-029 Concern 3 names this the Pattern-B base-default case — **no override needed**. (`RestClientEditor.ts` has no `beforeNavigateAway` override today — confirmed.)

### Mandatory-open + auto-Explorer (inherited from US-600-a)

US-600-a added `PageModel.sidebarMandatory`: *the sidebar is closeable only when Explorer is the sole panel contributor; any non-Explorer panel makes it mandatory-open and hides the toggle/✕.* Once the Rest Client contributes `rest-panel`, the rule applies automatically — the sidebar is mandatory-open and the toolbar `NavPanelButton` is hidden. This **preserves** the "panel always visible, no toggle" behaviour with **no new code**.

US-600-a also added `PageModel._maybeAutoInitExplorer()`: when the sidebar is mandatory, no Explorer exists, and a panel-contributing editor exposes a **local-file** `getNavigatorTarget()`, the Page **auto-creates an Explorer panel** rooted at that file's folder. `RestClientEditor.getNavigatorTarget()` (`:174-180`) returns `{ pipe, filePath }` for a saved `.rest.json`. So opening a **saved** Rest Client file will add an Explorer panel above the Rest panel — the same inherited behaviour confirmed for Todo/Notebook/Link. See Concern A.

## Target design

**Invariant:** while a `RestClientEditor` is the page's main editor, the `SecondaryViews` sidebar is open (mandatory) and hosts exactly `[rest-panel]`. An Explorer panel, when present (saved file — Concern A), is hoisted to the top by `PageModel.panelEditors`; the **Rest panel is the active/expanded one** (seeded). `RestClientBody` renders only the center detail (request builder + response) — no inline left tree, no left splitter. When the page navigates away, the base `beforeNavigateAway` clears `secondaryView` and the panel disappears.

**One new registered secondary view:**

| ID | Label | Renders | Source moved from |
|---|---|---|---|
| `rest-panel` | `Rest` | header: "Rest" (portaled into `headerRef`); body: `<RequestTree vm items selectedId>` over `traited([rootItem], requestTreeItemTraits)` — **root node + "+" button unchanged** | `RestClientBody.tsx:38-90` |

It reads the editor via `editor.state.use(...)` (the `requests` + `selectedRequestId` slice the body reads today for the tree) and portals "Rest" into `headerRef`.

**Behaviour parity checklist (must be identical):** add a request (the tree's root "+" button, and the collection context-menu "Add Request"); select a request → center shows its builder/response, cached response restored; rename request (inline in detail header); change a request's collection (inline); delete request (with confirm); duplicate request (context menu); "Open in New Editor" for a request and for a collection; delete collection (with confirm + scope); drag a request to reorder / move between collections; drop a link (LINK trait) onto the root / a collection / a request → creates a request; "Copy as cURL/fetch" menus.

## Implementation Plan

> Order: (1) register the panel; (2) new `RestPanelSecondaryView`; (3) `RestClientEditor` registers the panel + seeds active panel + drops `leftPanelWidth`; (4) `RestClientBody` drops the inline tree + splitter + width plumbing; (5) `tsc`/`eslint`; (6) manual smoke test. **`RestClientShared.tsx` is not changed.**

### Step 1 — Register the secondary view

`src/renderer/editors/register-editors.ts` — after the `todo-panel` block (`:61`), add:

```ts
secondaryViewRegistry.register({
    id: "rest-panel",
    label: "Rest",
    loadComponent: () => import("./rest-client/panels/RestPanelSecondaryView"),
});
```

### Step 2 — New `RestPanelSecondaryView`

`src/renderer/editors/rest-client/panels/RestPanelSecondaryView.tsx` (NEW). Mirrors `TodoSecondaryView` (type-guard → inner body → portal header). The inner body reads the tree slice, builds the **root-wrapped** traited items exactly as `RestClientBody` does today, and renders `RequestTree` verbatim:

```tsx
import { useMemo } from "react";
import { createPortal } from "react-dom";
import type { SecondaryViewProps } from "../../../ui/secondary-views/secondary-view-registry";
import { Panel } from "../../../uikit";
import { traited } from "../../../core/traits/traits";
import {
    RequestTree,
    buildGroupedTree,
    requestTreeItemTraits,
    type RequestTreeItem,
} from "../RestClientShared";
import { RestClientEditor } from "../RestClientEditor";

export default function RestPanelSecondaryView({ model, headerRef }: SecondaryViewProps) {
    // Type-guard early return must precede any hooks; the hook-using body lives
    // in an inner component (same pattern as TodoSecondaryView).
    if (!(model instanceof RestClientEditor)) return null;
    return <RestPanelBody editor={model} headerRef={headerRef} />;
}

function RestPanelBody({
    editor,
    headerRef,
}: {
    editor: RestClientEditor;
    headerRef: SecondaryViewProps["headerRef"];
}) {
    const state = editor.state.use((s) => ({
        requests: s.data.requests,
        selectedRequestId: s.selectedRequestId,
    }));

    // Root-wrapped tree — moved verbatim from RestClientBody. The "__root__"
    // node renders the "REQUESTS" label + "+" add button inside the tree.
    const rootItem = useMemo<RequestTreeItem>(
        () => ({ id: "__root__", isRoot: true, items: buildGroupedTree(state.requests) }),
        [state.requests],
    );
    const tItems = useMemo(() => traited([rootItem], requestTreeItemTraits), [rootItem]);

    return (
        <>
            {headerRef && createPortal(<>Rest</>, headerRef)}
            <Panel
                name="rest-panel-pane"
                direction="column"
                flex={1}
                overflow="auto"
                minHeight={0}
                minWidth={0}
            >
                <RequestTree vm={editor} items={tItems} selectedId={state.selectedRequestId} />
            </Panel>
        </>
    );
}
```

> The outer width/background that `RestClientBody`'s `rest-left-panel` used to provide now comes from the `SecondaryViews` container + splitter. `rest-panel-pane` reproduces the old `rest-left-tree` scroll wrapper (`flex={1} overflow="auto" minHeight={0} minWidth={0}`). No changes to `RequestTree` / `RestClientShared.tsx`.

### Step 3 — `RestClientEditor`: register the panel, seed active panel, drop `leftPanelWidth`

`src/renderer/editors/rest-client/RestClientEditor.ts`:

**3a. Panel constant** — after the imports, before `isLegacyTextFileHost` (`:97`), add:
```ts
// Single collections/requests panel (labeled "Rest"). Registered once in
// adoptHost, constant for the editor's life on the page. The base
// beforeNavigateAway clears it on navigate-away (Pattern-B; no survival
// override). The sidebar is mandatory-open per PageModel.sidebarMandatory.
const REST_PANELS = ["rest-panel"];
```

**3b. Register in `adoptHost`** — right after `this._tearDownHostSubscriptions();` (`:262`), add:
```ts
this.secondaryView = REST_PANELS;
```

**3c. Seed active panel** — at the end of `adoptHost` (after the existing `if (this.page) host.setPage(this.page);` at `:325`), add `this._seedActivePanel();`. Replace the existing `setPage` override (`:328-331`) with the version below and add the helper:

```ts
setPage(page: IPageHost | null): void {
    super.setPage(page);
    this._host?.setPage(page);
    // Fresh-open path: adoptHost ran before the page was attached, so make
    // the single Rest panel the active (expanded) one once the page is
    // present and the panel is registered.
    if (page && this.contributesPanels()) this._seedActivePanel();
}

/** Make the single Rest panel the active/expanded one. CollapsiblePanelStack
 *  collapses any panel whose id !== activePanel, so a lone panel still needs
 *  this. No-op when no page is attached. */
private _seedActivePanel(): void {
    if (!this.page) return;
    this.page.expandPanel("rest-panel");
}
```

**3d. Delete `leftPanelWidth`** (dead after Step 4 — width is now owner-held in `ISecondaryViewsState`, persisted by the host per epic Concern 4):
- `RestClientViewSettings` (`:37-40`) — drop `leftPanelWidth?: number;` (leaves only `selectedRequestId?: string;`)
- `RestClientEditorState` (`:42-56`) — drop `leftPanelWidth: number;`
- `defaultRestClientEditorState` (`:58-71`) — drop `leftPanelWidth: 250,`
- `adoptHost` HS1 seed (`:283-289`) — drop the `if (saved.leftPanelWidth !== undefined) s.leftPanelWidth = saved.leftPanelWidth;` line
- `adoptHost` HS1 mirror-back (`:294-304`) — drop `leftPanelWidth: s.leftPanelWidth,` from the `setEditorState` object **and** the `${s.leftPanelWidth}|` segment from the composite slice-selector key (becomes `` (s) => s.selectedRequestId ``)
- `setLeftPanelWidth` method (`:940-946`) + its `// ── Layout ──` section header — delete

`selectedRequestId` **stays** in the HS1 slot (still drives the selection + restore). An old saved slot carrying `leftPanelWidth` is ignored on load (extra key, no reader) — no migration shim, consistent with the epic's reset-to-default stance.

Update the HS1 doc comment on `RestClientViewSettings` ("the 2 per-window UI fields" → "the per-window UI field").

### Step 4 — `RestClientBody`: drop the inline tree + splitter + width plumbing

`src/renderer/editors/rest-client/RestClientBody.tsx`:

**4a. Remove** the left pane: the `rest-left-panel` `Panel` + `rest-left-tree` + `RequestTree` (`:71-90`) and the `Splitter` (`:91-100`). Remove the `rootItem`/`tItems` `useMemo`s (`:38-50`) and the `leftPanelWidth` local mirror + `handleLeftPanelWidthChange` (`:30-36`). The root `rest-client-root` `Panel` becomes `direction="column"` and its single child is what was inside `rest-right-panel` (the `selectedRequest ? <SplitDetailPanel> : <empty>` conditional). Net: the detail/empty area is the only content.

**4b. Trim the selector** (`:19-28`) to what the center actually reads:
```ts
const state = editor.state.use((s) => ({
    data: s.data,
    error: s.error,
    selectedRequestId: s.selectedRequestId,
    executing: s.executing,
    response: s.response,
    responseTime: s.responseTime,
    headersJsonInvalid: s.headersJsonInvalid,
}));
```
(Drop `leftPanelWidth`. `selectedRequestId` stays so `editor.selectedRequest` re-derives reactively; `data` stays for the empty-state `data.requests.length` message; `response`/`responseTime`/`executing`/`headersJsonInvalid` stay for `SplitDetailPanel`'s `state` prop; `error` for the error display.)

**4c. Drop now-unused imports**: `Splitter`, `RequestTree`, `buildGroupedTree`, `type RequestTreeItem`, `requestTreeItemTraits`, `traited`, `useState`, `useMemo`. Keep `Panel`, `Text`, `EditorError`, `SplitDetailPanel`, `RestClientEditor`.

**No `panelExpanded` subscription** is added (Rest Client has no active-panel state to sync — like Todo, unlike Notebook/Link).

### Step 5 — Verify
`npx tsc --noEmit` + `npx eslint` on changed files.

### Step 6 — Manual smoke test
1. **Open a `.rest.json`** → sidebar is open, **cannot** be closed (no toggle); shows a single panel whose header reads **"Rest"**, with the tree's **"REQUESTS"** root row + "+" inside (Explorer hoisted above it if the file is saved — Concern A); the Rest panel is **expanded**; center shows the request builder + response (or the empty message). Width drag works (sidebar splitter).
2. **Add request** via the tree's root "+" (and via a collection's "Add Request" context menu) → new request appears + is selected.
3. **Select** a request → center shows its builder/response; cached response restored.
4. **Rename / change collection** (inline in detail header); **delete** (detail trash, with confirm); **duplicate** (context menu); **"Open in New Editor"** (request + collection) → opens a new page; **delete collection** (with confirm + scope).
5. **Drag-drop**: reorder a request; move a request between collections; drop a link onto the root / a collection / a request → creates a request (root drop still works — root node retained).
6. **Navigate away**: open another file in the same tab → the Rest panel **disappears** with the editor (Pattern-B). Returning → panel reappears, `selectedRequestId` restored from the HS1 slot.
7. **Restart** with a Rest Client open → sidebar restores open; the Rest panel re-derives and is expanded; no inline tree/splitter; `selectedRequestId` restored.
8. **Switch editor** (Rest Client ↔ Monaco on the same file) → panel appears/disappears with the Rest Client view; selection survives the round-trip (HS1 slot).

## Concerns / Open Questions

### Concern A — Auto-init Explorer appears in the Rest Client sidebar. **Inherited behaviour (US-600-a).**

`PageModel._maybeAutoInitExplorer()` auto-creates an Explorer panel rooted at the file's folder when the sidebar is mandatory and a panel editor exposes a local-file `getNavigatorTarget()`. `RestClientEditor.getNavigatorTarget()` returns `{ pipe, filePath }` for a saved `.rest.json`, so a saved Rest Client's sidebar becomes `[Explorer, Rest]` (Explorer hoisted first by `PageModel.panelEditors`). Unsaved Rest Clients (`{}` target) get no Explorer. No extra code — inherited generically. The seeded active panel is `rest-panel`, so Explorer renders **present but collapsed**; the user can expand it. *(Same precedent as Todo US-603 / Notebook US-602 / Link US-600-a.)* Confirm in the smoke test that the auto-Explorer is rooted at the `.rest.json`'s folder and is not duplicated on restart.

### Concern B — Sidebar width persistence moves from editor to page. **Resolved by precedent (US-603 Concern B / US-602 Concern B).**

`leftPanelWidth` (editor/HS1-slot owned, per-rest-file, default 250) is deleted; the sidebar width becomes `ISecondaryViewsState.width`, owner-held and persisted by `PageModel` in its descriptor (epic Concern 4). Net change: the panel width is now **per-page**, not **per-rest-file**, and shared with whatever else uses that page's sidebar. Same trade-off accepted for Todo/Notebook/Links. An old HS1 slot carrying `leftPanelWidth` is ignored on load (no shim). Flagged only so the width-scope change is explicit.

### Concern C — Mandatory-open / no toggle. **Resolved by inherited US-600-a rule.**

Once the Rest Client contributes the panel, `PageModel.sidebarMandatory` is true → the sidebar can't be closed and the `NavPanelButton` is hidden. This **preserves** today's "always-visible, no toggle" left panel. No new code.

### Concern D — Two labels ("Rest" header + "REQUESTS" tree root). **Per the user steer — confirmed.**

The panel header shows "Rest"; the tree's root row keeps showing "REQUESTS" with the "+" button. The user explicitly chose to move the tree untouched and label the panel "Rest", so both appear. No de-duplication is attempted in this task (that would be the header-button refactor the user declined). The empty-panel drop target is **preserved** (the root node is retained), so no drop-behaviour regression.

### Concern E — Single panel (no split). **Confirmed.**

The Rest Client side panel stays **one** collections/requests panel labeled "Rest" (the existing `RequestTree`, moved verbatim). The set is always `[rest-panel]` while the Rest Client is on the page and **gone** when it navigates away (base `beforeNavigateAway`). No active-panel/breadcrumb state, so no `_seedActivePanel` map and no `panelExpanded` body subscription — only the unconditional `expandPanel("rest-panel")` seed so the lone panel renders expanded.

### Out of scope
- MCP Inspector / Storybook — **excluded from EPIC-029** (not file-backed; dropped 2026-06-05, formerly US-605 / US-606).
- Any change to `RequestTree` / `RestClientShared.tsx` (root node, "+", DnD, context menus — all retained), the request builder (`RequestBuilder`), response viewer (`ResponseViewer`), the request↔response horizontal splitter inside `SplitDetailPanel`, serialization, send logic, or the response cache — untouched.
- Moving the "+"/title into the header or de-duplicating the two labels — **explicitly declined** by the user.
- `secondary-views.md` doc drift — epic close-out **US-607**.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [ ] Opening a `.rest.json` shows the sidebar open and **non-closeable** (no toggle), hosting a single panel whose header reads **"Rest"**, containing the unchanged `RequestTree` (root "REQUESTS" row + "+"), and that is **expanded** (Explorer hoisted above it when the file is saved); `RestClientBody` renders **no** inline left `Panel`/`Splitter`.
- [ ] Add (tree root "+" and collection "Add Request"), select, rename, change-collection, delete, duplicate, "Open in New Editor", delete-collection all behave **identically** to today.
- [ ] Drag-drop reorder / move-between-collections / link-drop-creates-request (incl. drop onto the empty root) behave **identically** to today.
- [ ] Selecting a request restores its cached response; the center builder/response is unchanged.
- [ ] Navigating the page away from the Rest Client **drops** the panel (Pattern-B); returning restores it with `selectedRequestId` from the HS1 slot.
- [ ] Restart restores the sidebar open with the panel re-derived and expanded; no inline tree/splitter.
- [ ] Opening a saved `.rest.json` initializes an Explorer panel rooted at the file's folder (Concern A).

## Files Changed (summary — projected)

| Area | File | Change |
|---|---|---|
| Register panel | `editors/register-editors.ts` | add `rest-panel` registration (label "Rest") |
| Rest view | `editors/rest-client/panels/RestPanelSecondaryView.tsx` | **NEW** — portal "Rest" header; body = `RequestTree` over the root-wrapped items (moved verbatim from `RestClientBody`) |
| Editor | `editors/rest-client/RestClientEditor.ts` | `REST_PANELS` const; `secondaryView = REST_PANELS` in `adoptHost`; `_seedActivePanel()` + `setPage` augmentation; **delete** `leftPanelWidth` (state + default + HS1 slot + seed + mirror key + `setLeftPanelWidth`) |
| Main view | `editors/rest-client/RestClientBody.tsx` | remove inline left `Panel` + `RequestTree` + `Splitter` + width mirror + `rootItem`/`tItems`; collapse root to column; trim the state selector; drop now-unused imports |
| Dashboard | `doc/active-work.md` | link US-604 to this doc |
| Epic doc | `doc/epics/EPIC-029.md` | mark US-604 row investigated + note single-panel + "Rest" label + Concern A |

**Explicitly NOT changed:** `RestClientShared.tsx` (`RequestTree`, root node, "+", DnD, context menus — all retained verbatim); `SecondaryViews.tsx` / `SecondaryViewsModel.ts` (already host-agnostic); `PageModel` (`sidebarMandatory` + auto-Explorer rules from US-600-a already cover Rest Client generically); `RequestBuilder.tsx` / `ResponseViewer.tsx` / `KeyValueEditor.tsx` (reused as-is); `RestClientEditor` data/CRUD/serialize/send/response-cache internals; `restClientTypes.ts`; `rest-client/index.tsx` (`TextChrome` wrapper unchanged).
