# US-600-a: Links — always-on `SecondaryViews`, drop in-view panels, unify Category click

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 1b (inserted before Phase 2) · **Status:** ✅ Implemented (2026-06-05) — Steps 1–7 done; `tsc --noEmit` + `eslint` clean. Awaiting manual smoke test (Step 8). Per the epic deferred-review model, stays `[ ]` on the dashboard until US-607 close-out. **Two deviations from plan (both safe, see note below).**

> **Implementation notes / deviations from the projected plan:**
> 1. **Active-panel seed** — the plan said to seed the saved `expandedPanel` as the sidebar's active panel "inside `adoptHost`". But in the fresh-open path `adoptHost` runs *before* the editor is attached to a page (`this.page` is null there). So the seed is done via a private `_seedActivePanel()` helper called from **both** `adoptHost` (covers the restore path, where the page is already set) **and** the `setPage` override (covers fresh-open, which fires after `adoptHost` when the page attaches the editor).
> 2. **Hostnames bottom list** — the plan assumed no `treeProvider.getHostnameItems` existed and projected a manual `getHostname(link.href) === selectedHostname` filter. It **does** exist (`LinkTreeProvider.ts:221`), so `LinkHostnamesNavigationPanel` uses it exactly like `LinkTagsNavigationPanel` uses `getTagItems` (selected hostname → `getHostnameItems`, none → all non-directory links).
> 3. **Explorer auto-init (post-implementation follow-up, user-requested during testing, 2026-06-05).** Hiding the nav-panel toggle (Step 6) removed the only path to the file Explorer on a Link page. To preserve the pre-task affordance, `PageModel` now **auto-creates an Explorer panel rooted at the panel editor's file folder** whenever the sidebar is mandatory, no Explorer exists, and a panel-contributing editor exposes a local-file `getNavigatorTarget()`. Implemented as `_maybeAutoInitExplorer()` / `_autoInitExplorer()` / `_explorerRootForPanels()` called from `_enforceMandatoryOpen()`. Deferred via `queueMicrotask` + `findExplorer()` guard so a persisted Explorer re-attached during session restore is **not** duplicated (all restore attaches run synchronously before the microtask fires). The gate is general (not Link-coupled): Archive returns a `null` target → excluded; Todo/Notebook don't contribute panels until Phase 3 → excluded for now, auto-covered when they migrate. Unsaved/remote collections (`{}` target) get no Explorer.

## Goal

Make the Link editor render its panels **only** through `SecondaryViews`, never inline in its own main view, and make the sidebar **mandatory-open** while a Link editor is on the page. Unify the Categories panel so it **always** shows categories + links, and re-specify its click behavior:

- **Link clicked** → navigate the **main view** to that link's file.
- **Category clicked** → show the **Link editor's own main view** (filtered to that category) — promoting the Link editor back to main if a file is currently shown.

This removes the dual-render split (in-body stack vs. sidebar) and the dual-behavior Categories panel (categories-only vs. categories+links), collapsing both into one host-agnostic behavior. That makes the Link panel surface reusable by **US-601**'s `BrowserPanelHost` (which embeds the same Link editor + `SecondaryViews` in the browser empty page with no main-editor swap).

> **US-601 depends on this.** After this refactor, US-601 mounts `SecondaryViews` in the browser empty page and the browser's Link editor renders its panels there with the same code path — no in-editor panel duplication to special-case.

## Background

### The dual-render split (what exists today)

The three Link panels (`link-category`, `link-tags`, `link-hostnames`) render in **two** different places depending on whether the sidebar is open:

| Sidebar | Where panels render | Driven by |
|---|---|---|
| **Closed** | **Inline** in the main view via `CollapsiblePanelStack` | `LinkBody.tsx:154-183` (`!showPanelsInSidebar`) |
| **Open** | In `SecondaryViews` (registered secondary views) | `LinkEditor.setSidebarPanels(true)` → `secondaryView = LINK_PANELS` |

The bridge is `LinkBody.tsx:38-46`: a `useEffect` watching `isNavigatorOpen` (= `page.secondaryViewsModel.state.open`) that calls `model.setSidebarPanels(isNavigatorOpen)`:
- `LinkEditor.setSidebarPanels(open)` (`LinkEditor.ts:391-406`): when `open` → `secondaryView = LINK_PANELS` + `expandPanel`; when closed → `secondaryView = undefined`. Gated on `this.isMain` (`:392`).

So today the panels live in the body when the sidebar is closed, and the sidebar is freely toggleable via the toolbar `NavPanelButton` (`PageToolbar.tsx:39-55` → `page.toggleNavigator`).

### The Categories panel dual-behavior

`LinkCategoryPanel` (`LinkCategoryPanel.tsx:28`) has two flags:
- `categoriesOnly` (default `true`) → `showLinks={!categoriesOnly}` on `TreeProviderView` (`:128`): categories-only vs. categories + links.
- `useOpenRawLink` → click handler (`handleItemClick`, `:44-59`): `true` dispatches `openRawLink`; `false` calls `vm.setSelectedCategory(item.href)` (filter in place).

Wired at two call sites:

| Call site | `categoriesOnly` | `useOpenRawLink` | Result |
|---|---|---|---|
| `LinkBody.tsx:165` (inline) | `true` (default) | `false` | categories only; click filters the center list |
| `LinkCategorySecondaryView.tsx:75-80` | `={isMainEditor}` | `={!isMainEditor}` | **main:** categories only + filter · **secondary:** categories+links + `openRawLink` |

So categories + links appears **only** when the Link editor is demoted (standalone-secondary, a file open in main). And in that demoted state, clicking a **category folder** currently dispatches `openRawLink` → `treeProvider.getNavigationUrl(folder)` returns an encoded `tree-category://` link → opens a **separate `CategoryEditor`** in the main view (not the Link editor's own main view).

### Tags / Hostnames panels (for consistency scope — Concern 3)

- `LinkTagsSecondaryView.tsx:184-192`: `isMainEditor ? <LinkTagsPanel> : <LinkTagsNavigationPanel>`. `LinkTagsPanel` is a pure filter list (`CategoryList` → `setSelectedTag`). `LinkTagsNavigationPanel` (`:23-161`) adds a bottom links list whose click dispatches `openRawLink` (`:65-76`).
- `LinkHostnamesSecondaryView.tsx`: always `LinkHostnamesPanel` — a pure filter list (`CategoryList` → `setSelectedHostname`). No links list, no navigation.

### The promote/demote + survival machinery (must be preserved)

- `editor.isMain` (`EditorModel.ts:183`) = `this.page?.mainEditorInstance === this`. Used by the two secondary views (US-600) to pick header label/form.
- `promoteSecondaryToMain(model)` (`PageModel.ts:400-408`) is a **toggle**: if `model.id === _mainEditorId` it demotes (`setMainEditor(null)`), else it promotes. → A category-click "show main view" must guard with `if (!editor.isMain)` so it never accidentally demotes.
- Survival on navigate-away: `beforeNavigateAway` (`LinkEditor.ts:413-418`) keeps panels if `_isOpenedFromMe(newModel)`, else self-evicts (`secondaryView = undefined`). `onMainEditorChanged` (`:424-434`) reshapes to `[link-category, link-tags]` on demote (drops `link-hostnames`, LK8) or evicts if not opened-from-us. `_isOpenedFromMe` (`:444-449`) matches `sourceId === this.id` or `"link-category"` / `"link-tag"`.

### How the sidebar open/close is controlled

- `SecondaryViews` returns `null` when `!state.open` (`SecondaryViews.tsx:40`) → forcing-open requires `state.open === true`.
- `PageModel.setSecondaryViewsState` (`:418-435`) is the single side-effecting setter (clamps width, fires `secondaryViewsToggled` / `panelExpanded`).
- Close affordances: the toolbar `NavPanelButton` toggle (`PageToolbar.tsx:52`), and the Explorer panel's own ✕ (`ExplorerSecondaryView.tsx:127-133` → `setSecondaryViewsState({ open:false })`). The Link panels have **no** ✕ (only Save + swap-to-main in `LinkCategorySecondaryView`).
- `PageModel.hasSidebar` (`:186-187`) = `editors.some(e => e.contributesPanels()) || secondaryViewsModel !== null`. Drives `SecondaryViewsWrapper` mount (`Pages.tsx:42-44`).

## Target design

**Invariant:** while a `LinkEditor` is present on a page (as main **or** as a surviving standalone-secondary), the `SecondaryViews` sidebar is open, cannot be closed, and hosts the Link panels. `LinkBody` shows only the center filtered-links list (+ pinned panel) — no inline panel stack. The Categories (and, per Concern 3, Tags/Hostnames) panels always show their items + links.

**Unified Category click:**
- `item.isDirectory` (a category folder) → `vm.setSelectedCategory(item.href)`; if `!vm.isMain` → `vm.page?.promoteSecondaryToMain?.(vm)` (optional-chaining no-ops in the Browser host, where the Link editor is always the embedded main view).
- else (a link) → `openRawLink(navUrl, { sourceId: "link-category", pageId, fallbackTarget: "monaco", … })` (today's `useOpenRawLink` path), which opens the file in the main view and lets the Link editor survive in the sidebar via `_isOpenedFromMe`.

This is host-agnostic: on a Page the category click promotes+filters; in the Browser empty page (no swap) it just filters.

## Implementation Plan

> Order: (1) LinkEditor registers panels unconditionally; (2) mandatory-open enforcement; (3) LinkBody drops the inline stack + toggle bridge; (4) Categories panel always categories+links + unified click; (5) Tags/Hostnames consistency (Concern 3); (6) hide the toggle button on mandatory pages; (7) `tsc`/`eslint`; (8) manual smoke test.

### Step 1 — `LinkEditor` registers panels whenever it is on a page (not gated on sidebar-open)

`LinkEditor.ts` — panels should be a property of "the Link editor is here," independent of the sidebar `open` flag.

- In `adoptHost` (`:299-378`), after host adoption, set the panel list once: `this.secondaryView = LINK_PANELS;`. This is the only place the set is established; it stays constant for the editor's life on the page (Concern 4). Currently the list is only set later by `setSidebarPanels`.
- **Remove `setSidebarPanels(open)`** (`:391-406`) and its sole caller (the `LinkBody` `isNavigatorOpen` effect, dropped in Step 3) — the open-gating it performed no longer exists (panels are always registered; the sidebar is always open per Step 2). Preserve its "restore the previously-expanded panel" behavior by seeding the owner's active panel inside `adoptHost` when a page is present: map the saved `expandedPanel` (`"categories"`/`"tags"`/`"hostnames"`) → panel ID (`link-category`/`link-tags`/`link-hostnames`) and call `this.page?.expandPanel(panelId)`. The runtime `expandedPanel` ↔ active-panel sync continues via the `panelExpanded` subscription in `LinkBody` (Step 3), so no other wiring is needed.
- **Remove the LK8 tags-slice subscription** (`_tagsSliceUnsub`, set up at `:355-363`): with a constant set (Concern 4), there is no zero-tags reshape — the Tags panel stays visible even when the collection has no tags (shows "All"). Tear-down ref also removed from `_tearDownHostSubscriptions`.
- Survival hooks keep their **evict-or-keep** role (unchanged in spirit, simplified): `beforeNavigateAway` (`:413-418`) → keep (no-op, already `LINK_PANELS`) if `_isOpenedFromMe`, else `secondaryView = undefined`. `onMainEditorChanged` (`:424-434`) → `secondaryView = undefined` if not opened-from-us, else keep `LINK_PANELS` (drop the hostnames-reshape line). So the set is either *all three* or *gone* (external navigation) — never a partial subset.

### Step 2 — Mandatory-open enforcement (Concern 1 — RESOLVED: Page-side Explorer rule)

The rule lives entirely on the Persephone Page, generalizing the epic's "Explorer-only-closeable" note (Concern 2a). **No `EditorModel` capability is added** — the Link editor only has to *contribute* its panels (Step 1); the Page decides closeability by inspecting its own panel contributors.

**Rule:** the sidebar is closeable **only when the Explorer is the sole secondary-view contributor**. If any non-Explorer panel exists (Link / Archive / future Todo / Notebook / … panels), the sidebar is **mandatory** and cannot be closed.

`src/renderer/api/pages/PageModel.ts`:
- Add getter (reuses the same `type === "fileExplorer"` discriminator as `findExplorer()` `:453-457`):
  ```ts
  /** Sidebar is closeable only when the Explorer is the *sole* panel
   *  contributor. Any other secondary view (Link/Archive/Todo/Notebook/… panels)
   *  makes it mandatory and non-closeable. */
  get sidebarMandatory(): boolean {
      return this.editors.some(
          (e) => e.contributesPanels()
              && (e.state.get() as { type?: string }).type !== "fileExplorer",
      );
  }
  ```
- In `setSecondaryViewsState` (`:418`), clamp before applying: `if (patch.open === false && this.sidebarMandatory) patch = { ...patch, open: true };` (close request ignored; width/activePanel still apply).
- Add a private `_enforceMandatoryOpen()`: `if (this.sidebarMandatory) this.ensureSecondaryViewsModel().setStateQuiet({ open: true });`. Call it from the lifecycle points that already recompute `hasSidebar` — `attach`, `removeSecondaryEditor`, and `onEditorPanelsChanged` (the `s.hasSidebar = this.hasSidebar` sites near `:211/:238/:298`) — so opening a Link editor (or any mandatory panel) force-opens the sidebar even on the initial attach (where the editor's `secondaryView` slice was set before the page subscribed). `setStateQuiet` avoids re-firing `secondaryViewsToggled`; bump `state.version` if the wrapper needs a re-render (the `ensureSecondaryViewsModel` subscription already does).
- Add optional `sidebarMandatory?: boolean` to `IPageHost` (`IPageHost.ts`) — PageModel implements the Explorer rule above; `BrowserPanelHost` (US-601) returns `true`. Read by the toggle/close affordances (Step 6).

### Step 3 — `LinkBody` drops the inline panel stack + the toggle bridge

`src/renderer/editors/link-editor/LinkBody.tsx`:
- **Remove** the `isNavigatorOpen` `useOptionalState` + the `useEffect` calling `setSidebarPanels` (`:38-46`).
- **Remove** the entire `{!showPanelsInSidebar && ( <CollapsiblePanelStack …/> <Splitter …/> )}` block (`:154-183`) and the `showPanelsInSidebar` / `leftPanelWidth` usage. Drop now-unused imports (`CollapsiblePanel`, `CollapsiblePanelStack`, `Splitter`, the three inline `*Panel` imports if unused elsewhere here).
- Keep the `panelExpanded` subscription (the second sub in the `:50-71` block) that maps sidebar panel IDs → `expandedPanel` state (still drives the breadcrumb + filter). Keep the center list + pinned panel.
- **Drop the now-dead `secondaryViewsToggled` no-op subscription** (`:53-56`) — it existed only to pair with the removed `isNavigatorOpen`. Remove `secondaryViewsToggled` from the `:11` import (keep `panelExpanded`).
- Net: `LinkBody` becomes the center (filtered list / empty states) + pinned panel only.

### Step 4 — `LinkCategoryPanel`: always categories+links, unified click

`src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx` (after Step 3, the **only** caller is `LinkCategorySecondaryView` — `LinkBody`'s usage is gone, so prop removal is safe):
- **Remove both `categoriesOnly` and `useOpenRawLink` props** from `LinkCategoryPanelProps` (`:17-26`) and the signature (`:28`). The `TreeProviderView` props become constant: `showLinks={true}`, `selectedHref={selectedItemHref}`, `onContextMenu={handleContextMenu}` (`:126-134`). The `selectedCategory` `useSyncExternalStore` read (`:29-32`) becomes unused (it only fed the old `categoriesOnly ? selectedCategory : …`) — delete it.
- Rewrite `handleItemClick` (`:44-59`) to the unified behavior (no longer branches on `useOpenRawLink`):
```ts
const handleItemClick = useCallback((item: ILink) => {
    if (item.isDirectory) {
        vm.setSelectedCategory(item.href);
        if (!vm.isMain) vm.page?.promoteSecondaryToMain?.(vm);
    } else {
        if (item.id) vm.selectLink(item.id);
        const navUrl = vm.treeProvider.getNavigationUrl(item);
        app.events.openRawLink.sendAsync(createLinkData(navUrl, {
            target: item.target || undefined,
            sourceId: "link-category",
            category: item.category,
            ...(pageId ? { pageId, fallbackTarget: "monaco", title: item.title } : undefined),
        }));
    }
}, [vm, pageId]);
```
  No type widening needed: `LinkSource` is `export type LinkSource = import("./LinkEditor").LinkEditor` (linkTypes.ts:79) — a direct alias to the concrete `LinkEditor`, which already exposes `isMain` (getter) and `page` via `EditorModel`. `item.isDirectory` is the category-folder discriminator (same one `getTreeItemLabel`/`handleContextMenu` use).

`src/renderer/editors/link-editor/panels/LinkCategorySecondaryView.tsx`:
- `:75-80` — drop `categoriesOnly`/`useOpenRawLink`; always pass `pageId={editor.page?.id}`.
- Header label → fixed **"Collections"** (`:51`), no longer `{isMainEditor ? "Categories" : "Links"}` (Concern 5). The `isMainEditor` value (`useOptionalState(editor.page?.state, () => editor.isMain, false)`) is still read for the Save-button visibility (`:53`) and the swap-button title (`:65`) — keep that; only the header text becomes constant.
- Align the related labels to "Collections": the main-view breadcrumb `rootLabel` (`index.tsx` `LinkBreadcrumbBits` `:91`, currently `"Categories"`) → `"Collections"`. *(Confirmed — Concern 5.)*

### Step 5 — Tags / Hostnames full parity (Concern 3 — RESOLVED: unify all three + add Hostnames links list)

**Tags** — `LinkTagsSecondaryView.tsx:184-192`: always render `LinkTagsNavigationPanel` (drop the `isMainEditor ? <LinkTagsPanel> : <LinkTagsNavigationPanel>` switch). The `isMainEditor` `useOptionalState` (`:182`) is then unused — remove it (and the `useOptionalState` import + the unused `LinkTagsPanel` import if it's no longer referenced in this file; it stays imported transitively via `LinkTagsNavigationPanel`). Two interactions:
- **Tag selected** in the tags tree (the inner `LinkTagsPanel` `CategoryList` → `setSelectedTag`): **filter-only — NO promote/navigate.** Selecting a tag updates `selectedTag` on the model (applies the filter everywhere) and refreshes the panel's own bottom links list. The main view is **not** touched. (No `promoteSecondaryToMain` call here.)
- **Link clicked** in the bottom list (`handleSelect`, `:65-76`): dispatches `openRawLink` (`sourceId: "link-tag"`) to open the file — unchanged. (This is a *link* click, not a tag click.)

**Hostnames** — give it the same navigation form as Tags. New component `LinkHostnamesNavigationPanel` (mirror `LinkTagsNavigationPanel`):
- Top = the hostnames `CategoryList` (`LinkHostnamesPanel`); resizable bottom = a `LinksList` of the links under the selected hostname.
- Bottom items: there is **no** `treeProvider.getHostnameItems` (unlike `getTagItems`), so filter `editor.state.get().data.links` directly by `getHostname(link.href) === selectedHostname` (all links when none selected) — mirror `LinkTagsNavigationPanel.tagItems` (`:57-63`) but by hostname (`getHostname` from `components/tree-provider/favicon-cache`, as `LinkEditor.loadHostnames` uses).
- **Hostname selected** → `setSelectedHostname` only — **filter-only, NO promote/navigate** (same as Tags).
- **Bottom link clicked** → `openRawLink` with `sourceId: "link-hostname"`.
- `LinkHostnamesSecondaryView.tsx` renders `LinkHostnamesNavigationPanel` (always-on form; no main/secondary fork).

**Navigation summary:** only a **category-folder** click (Categories panel, Step 4) promotes/navigates the page to the Link main view. Tag/hostname selection filters only. Any **link** click (in any panel's tree or bottom list) opens that link's file in the main view.

**Survival matching:** `_isOpenedFromMe` (`LinkEditor.ts:444-449`) currently matches `sourceId === "link-category" || "link-tag"`. **Add `"link-hostname"`** so a hostname-list link click keeps the Link panels alive (same as category/tag clicks).

### Step 6 — Hide the close affordances on mandatory pages

- `src/renderer/editors/base/PageToolbar.tsx` `NavPanelButton` (`:39-55`): return `null` when `model.page?.sidebarMandatory` (the sidebar can't be toggled, so the button is meaningless).
- `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` `explorer-close` ✕ (`:127-133`): hide it when `model.page?.sidebarMandatory` (Explorer coexisting with a Link/Archive/etc. panel) — its `setSecondaryViewsState({ open:false })` is already a no-op under the Step 2 clamp, so hiding it just avoids a dead button. The Link panels already have no ✕.

### Step 7 — Verify
`npx tsc --noEmit` + `npx eslint` on changed files.

### Step 8 — Manual smoke test
1. **Open a `.link.json`** → sidebar is open and **cannot** be closed (toggle button gone); Categories panel shows categories **+ links**; main view shows the filtered list.
2. **Click a category** in the sidebar → main view filters to that category (Link editor stays/returns as main).
3. **Click a link** in the sidebar → file opens in the main view; sidebar + Link panels **survive**.
4. **Click a category again** (while a file is in main) → Link editor's own main view returns, filtered to that category (promote path).
5. **Open an unrelated file** (Explorer/other tab) → Link panels **drop** (self-evict); sidebar closes if nothing else mandates it.
6. **Tags / Hostnames** — each shows a bottom links list; selecting a tag/hostname filters only (no navigation, main view unchanged); clicking a link in the bottom list opens the file.
7. **Restart** with the collection open → sidebar restores open; panels re-derive; no inline stack appears.
8. **Browser (expected interim regression — Concern 8):** open the browser empty tab and the bookmarks drawer → the center links list, breadcrumb, Add-Link, search, and link-opening still work, but the Categories/Tags/Hostnames **panels are gone** (no crash, no console errors). This is expected and restored by US-601. Confirm all owner calls stayed optional-chained (`page?.promoteSecondaryToMain?.`, `page?.sidebarMandatory`) so nothing in `bookmarks.linkEditor` (no `page`) throws.

## Concerns / Open Questions

### Concern 1 — Mandatory-open / non-closeable. **RESOLVED (user, 2026-06-05): Page-side Explorer rule.**
The logic lives on the Persephone Page. The sidebar is closeable **only** when the Explorer model is the *sole* secondary-view contributor; if **any** other secondary view exists (Link panels, Archive panel, or future Todo/Notebook/etc. panels) the sidebar is **mandatory** and cannot be closed. Implemented as `PageModel.sidebarMandatory` (Step 2) — generalizes the epic's "Explorer-only-closeable" note (Concern 2a), needs **no** `EditorModel.requiresSidebar()` capability and no `instanceof` coupling (it discriminates on the existing `type === "fileExplorer"` marker). `BrowserPanelHost` (US-601) returns `true`. **Explorer ✕:** when Explorer coexists with another panel the Step 2 clamp already ignores its close request; Step 6 additionally hides the ✕ when `page.sidebarMandatory` so there's no dead button.

### Concern 2 — Category click target. **RESOLVED (user, 2026-06-05): promote the Link editor's own main view.**
A category-folder click promotes/filters the **Link editor's own main view** (Step 4 — `setSelectedCategory` + `if (!isMain) promoteSecondaryToMain`), not a separate `CategoryEditor`. The in-panel `openRawLink`→`CategoryEditor` path for category folders is retired. `CategoryEditor` remains for `tree-category://` links opened from **other** contexts (documents, breadcrumbs, sibling pages) — not removed.

### Concern 3 — Tags / Hostnames unification. **RESOLVED (user, 2026-06-05): structural parity, but NO navigate on tag/hostname select.**
All three panels always show their items + a bottom links list (Tags already does; **Hostnames gains one** via the new `LinkHostnamesNavigationPanel`, mirroring `LinkTagsNavigationPanel`). **Navigation rule:**
- **Category** click (folder) → `setSelectedCategory` + promote the Link main view (navigate). *(Concern 2)*
- **Tag / Hostname** select → `setSelectedTag` / `setSelectedHostname` **only** — applies the filter to the model + the panel's bottom links list, **no promote, no page navigation.**
- **Link** click (any tree/bottom list) → `openRawLink` opens the file in the main view.

New `sourceId: "link-hostname"` added to `_isOpenedFromMe` survival matching (so a hostname bottom-list link click keeps the panels alive, like `"link-category"`/`"link-tag"`).

### Concern 4 — Panel **set** consistency. **RESOLVED (user, 2026-06-05): keep all three always visible.**
The sidebar always shows `[link-category, link-tags, link-hostnames]` for the whole time the Link editor is on the page — no reshape on promote/demote. This drops two pieces of today's logic: the `onMainEditorChanged` hostnames-drop-on-demote, and the **LK8 zero-tags reshape** (`_tagsSliceUnsub`) — so the Tags panel also stays visible even when the collection has no tags (it shows "All"). The set is now binary: *all three* while the Link editor lives on the page, or *gone* when it self-evicts on external navigation (survival logic unchanged).

### Concern 5 — Header label + redundancy. **RESOLVED (user, 2026-06-05): fixed header "Collections".**
The Categories panel header is always **"Collections"** — no `isMain` flip. (`isMain` is still read for the Save button + swap-button title, just not for the header text.) The sidebar tree (categories + links) and the main view (filtered list) both showing links is **intended** (tree = navigation, main = rich list/tiles). The main-view breadcrumb `rootLabel` (`LinkBreadcrumbBits`, today `"Categories"`) is **also** aligned to `"Collections"` (confirmed).

### Concern 6 — Fate of `leftPanelWidth`. **RESOLVED (user, 2026-06-05): delete it from the state.**
`leftPanelWidth` drove the old inline stack width — dead after Step 3 (sidebar width is owner-held in `ISecondaryViewsState`, persisted by the host per epic Concern 4). Remove it everywhere in `LinkEditor.ts`:
- `LinkEditorState` interface (`:50`) — drop `leftPanelWidth: number;`
- `defaultLinkEditorState` (`:77`) — drop `leftPanelWidth: 200,`
- `LinkViewSettings` HS1-slot interface (`:41`) — drop `leftPanelWidth?: number;`
- `adoptHost` HS1 seed (`:325`) — drop the `if (saved.leftPanelWidth …) s.leftPanelWidth = …` line
- `adoptHost` HS1 mirror-back (`:340-349`) — drop `leftPanelWidth: s.leftPanelWidth,` from `setEditorState` **and** the `${s.leftPanelWidth}|` segment from the composite slice-selector key
- `setLeftPanelWidth` method (`:526-530`) — delete
- `LinkBody.tsx` — drop `leftPanelWidth` from the `model.state.use({…})` destructuring (`:25`) (the inline stack + its splitter that consumed it are already removed in Step 3)

`expandedPanel` **stays** — it still maps to the active panel + drives the breadcrumb. Persisted-state migration: an old saved slot carrying `leftPanelWidth` is simply ignored on load (extra key, no reader) — no shim needed, consistent with the epic's reset-to-default stance.

### Concern 7 — `getNavigatorTarget` / `NavPanelButton`. **Resolved by Step 6.**
The Link host returns `{pipe, filePath}` so the toggle renders today; Step 6 hides it when `sidebarMandatory`. No other toggle entry point for a pure Link page.

### Concern 8 — Browser loses its Link panels until US-601. **ACCEPTED interim regression (user, 2026-06-05).**
The browser renders `LinkBody` from `model.bookmarks.linkEditor` — which has **no** `page`, so `isNavigatorOpen` is always `false` and the inline `CollapsiblePanelStack` is what shows its Categories/Tags/Hostnames panels today. This happens on **two** surfaces:
- `BrowserView.tsx:296` — `BlankPageLinks` (the empty `about:blank` tab)
- `BookmarksDrawer.tsx:123` — the bookmarks drawer

Removing the inline stack (Step 3) therefore **removes those panels from both browser surfaces** after this task. The browser stays compiling and runnable — the center links list, the toolbar breadcrumb (`LinkBreadcrumbBits`, rendered outside `LinkBody`), Add-Link, search, and link-opening all still work — but category/tag/hostname **panels** are gone there until **US-601** mounts `SecondaryViews` in the browser (for *both* `BlankPageLinks` and `BookmarksDrawer`). **Accepted** by the user as a bounded, single-task gap. **Do not ship a release between US-600-a and US-601** (the browser bookmarks UX is degraded in the interim).

### Out of scope (noted, not fixed here)
- `BrowserPanelHost` + mounting `SecondaryViews` in the browser empty page, retiring `BlankPageLinks` — **US-601** (this task is its prerequisite).
- The broader Notebook/Todo/Rest migrations — Phase 3.
- `secondary-views.md` doc drift — epic close-out **US-607**.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [ ] Opening a `.link.json` shows the sidebar open and **non-closeable** (no toggle button; close requests ignored); `LinkBody` renders no inline `CollapsiblePanelStack`.
- [ ] The Categories panel always shows categories **+ links** in every state (main and standalone-secondary).
- [ ] Category-folder click filters the Link editor's main view (promoting it back to main when demoted); link click opens the file in the main view with the Link panels surviving in the sidebar.
- [ ] Tags **and** Hostnames each show a bottom links list (Hostnames via the new `LinkHostnamesNavigationPanel`); selecting a tag/hostname **only filters** (model + bottom list, no page navigation); a bottom-list link click opens the file; only a category-folder click navigates/promotes the Link main view. No main-vs-secondary behavior fork remains in any of the three panels.
- [ ] Survival semantics unchanged: navigate-within keeps panels, navigate-external drops them.
- [ ] Browser (Concern 8): the empty tab + bookmarks drawer still load and operate (center list, breadcrumb, Add-Link, search, open-link) with **no crash/console error**; the Categories/Tags/Hostnames panels are expectedly absent there (restored by US-601).
- [ ] Forward-check: every owner call from the panels/editor is optional-chained so `BrowserPanelHost` (US-601) can host the same Link editor with no main-editor swap.

## Files Changed (summary — projected)

| Area | File | Change |
|---|---|---|
| Panels always-on | `editors/link-editor/LinkEditor.ts` | register `secondaryView = LINK_PANELS` in `adoptHost` (+ seed active panel via `page?.expandPanel`); **remove** `setSidebarPanels`; constant set — drop hostnames-reshape + remove LK8 `_tagsSliceUnsub` *(Concern 4)*; add `"link-hostname"` to `_isOpenedFromMe` *(Concern 3)*; delete `leftPanelWidth` (state + default + HS1 slot + seed/mirror + `setLeftPanelWidth`) *(Concern 6)* |
| Host (Concern 1) | `api/pages/PageModel.ts` | `sidebarMandatory` getter (Explorer-only-closeable rule); clamp `open:false`→`true` in `setSecondaryViewsState`; `_enforceMandatoryOpen()` helper called from `attach`/`removeSecondaryEditor`/`onEditorPanelsChanged` |
| Host iface | `api/pages/IPageHost.ts` | add optional `sidebarMandatory?` |
| Close affordances | `editors/base/PageToolbar.tsx`, `editors/explorer/ExplorerSecondaryView.tsx` | hide `NavPanelButton` + Explorer ✕ when `page.sidebarMandatory` *(Step 6)* |
| Main view | `editors/link-editor/LinkBody.tsx` | remove inline `CollapsiblePanelStack` + `isNavigatorOpen`/`setSidebarPanels` bridge + dead `secondaryViewsToggled` no-op sub + `leftPanelWidth` use; keep the `panelExpanded` mapping |
| Category panel | `editors/link-editor/panels/LinkCategoryPanel.tsx` | drop `categoriesOnly`/`useOpenRawLink`; unified `handleItemClick` (folder→filter+promote, link→open) |
| Category view | `editors/link-editor/panels/LinkCategorySecondaryView.tsx` | drop flag passthrough; always `pageId`; fixed header **"Collections"** *(Concern 5)* |
| Breadcrumb label | `editors/link-editor/index.tsx` (`LinkBreadcrumbBits`) | `rootLabel "Categories"` → `"Collections"` *(Concern 5)* |
| Tags view | `editors/link-editor/panels/LinkTagsSecondaryView.tsx` (+ `LinkTagsNavigationPanel`) | always navigation form (drop `isMainEditor` switch); tag select = filter-only, no promote *(Concern 3)* |
| Hostnames view | `editors/link-editor/panels/LinkHostnamesSecondaryView.tsx` | render new `LinkHostnamesNavigationPanel`; hostname select = filter-only, no promote *(Concern 3)* |
| Hostnames nav | `editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx` | **NEW** — hostnames list + resizable bottom links list (mirror `LinkTagsNavigationPanel`); link click → `openRawLink` `sourceId: "link-hostname"` *(Concern 3)* |
| Epic doc | `doc/epics/EPIC-029.md` | record US-600-a + note US-601 dependency |

**Explicitly NOT changed:** `SecondaryViews.tsx` / `SecondaryViewsModel.ts` (the controlled component is already host-agnostic); panel string IDs + registrations (`register-editors.ts` — the three panel IDs are unchanged; only a new *component* file is added); `CategoryEditor` (kept for `tree-category://` links opened elsewhere — Concern 2); `editor.isMain` / `promoteSecondaryToMain` semantics; LinkEditor data/CRUD/serialize internals; the browser files `BrowserView.tsx` (`BlankPageLinks`) + `BookmarksDrawer.tsx` (they keep rendering `LinkBody`, but inherit its panel-loss until US-601 — Concern 8).

## Dependency note for US-601

US-601 (`BrowserPanelHost` + `SecondaryViews` in the browser empty page) should be re-scoped to **build on** this task: the Link panels are already always-on and host-agnostic, so US-601's job narrows to (1) implement `BrowserPanelHost` as an `IPageHost` reporting `sidebarMandatory:true` and `isMain:true` for the embedded Link editor, (2) mount `<SecondaryViews>` on **both** browser surfaces that render `LinkBody` — `BlankPageLinks` (`BrowserView.tsx:296`) **and** `BookmarksDrawer.tsx:123` — to **restore the panels removed in Concern 8**, (3) retire `BlankPageLinks`'s bespoke chrome, (4) browser-state persistence (epic Concern 4). No Link-panel behavior changes remain for US-601. **Sequencing:** US-601 must follow US-600-a before any release (Concern 8 leaves the browser bookmarks panels temporarily absent).
