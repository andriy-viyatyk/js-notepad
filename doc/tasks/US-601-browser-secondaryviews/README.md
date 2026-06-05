# US-601: Browser adopts `SecondaryViews` in its empty page + bookmarks drawer

**Epic:** [EPIC-029](../../epics/EPIC-029.md) · **Phase:** 2 · **Status:** ✅ Implemented (2026-06-05) — Steps 1–7 done; `tsc --noEmit` + `eslint` clean. Awaiting manual smoke test (Step 8). Per the epic deferred-review model, stays `[ ]` on the dashboard until US-607 close-out.

> **Implementation note / deviation:** sidebar-width persistence (Concern C) is wired via a `BrowserPanelHost.onWidthChange` callback + `setInitialWidth(...)` rather than the panel host reaching into browser state directly — `BrowserEditor.configureBookmarks(bm)` sets both. That method also **absorbs the previously-duplicated** `onLinkOpen` / `onGetLinkMenuItems` setup (it was copy-pasted across `preloadBookmarks` + `initBookmarks`), so both bookmark-creation paths now share one configuration point. `setInitialWidth` is called after `bm.init()` (the `SecondaryViewsModel` exists by then, so it applies the width immediately; a falsy persisted width leaves the 240 default).

> **Bug fix during testing (2026-06-05) — tree expansion broke on category *label* click.** Clicking a category **label** (not the chevron) toggled the chevron but failed to render/hide children after the first couple of clicks; the chevron path worked fine. Root cause (shared code, latent since US-600-a's unified click): `LinkTreeProvider.watch` subscribed to the **entire** LinkEditor state with no selector, so `setSelectedCategory` → `applyFilters` fired a full async `TreeProviderViewModel.buildTree()` that **raced the Tree's expansion-toggle microtask** (`TreeModel.toggleAt` defers the `expanded` write + `gridRef.update({all:true})` to a microtask). A label click does both (toggle **+** `setSelectedCategory`); the chevron does only the toggle — hence chevron-only worked. **Fix:** scope `LinkTreeProvider.watch` to fire only when the structural input `data.links` changes (reference compare — immer copy-on-write makes add/edit/delete/move/import all replace the array; selection/filter/search/derived-list mutations leave it untouched). Selection highlight is unaffected (driven by the `selectedHref` prop, not `watch`). Fixes both the browser panels and the page Collections panel. File: `editors/link-editor/LinkTreeProvider.ts`.

> **Prerequisite:** [US-600-a](../US-600-a-links-secondaryviews-refactor/README.md) (✅ implemented). US-600-a made the Link panels **always-on and host-agnostic** and **removed** them from the two browser surfaces (`BlankPageLinks` + `BookmarksDrawer`) as an accepted interim regression (US-600-a Concern 8). **This task restores them via `SecondaryViews`.** Do **not** ship a release between US-600-a and US-601 — the browser bookmarks UX is degraded in the interim.

## Goal

Restore (and properly architect) the Categories / Tags / Hostnames panels in the browser by mounting the controlled `SecondaryViews` component on **both** browser surfaces that render the bookmarks `LinkBody`:

- `BlankPageLinks` — the empty `about:blank` tab (`BrowserView.tsx:278-300`)
- `BookmarksDrawer` — the slide-in-from-right drawer opened by the **"Open Bookmarks"** toolbar button (`BookmarksDrawer.tsx`)

Introduce a lightweight **`BrowserPanelHost`** (an `IPageHost` implementer) that owns the browser's `bookmarks.linkEditor` as its sole panel editor plus its own `SecondaryViewsModel`, reports `sidebarMandatory: true`, and treats the embedded Link editor as its main (`isMain: true`). This is the `IPageHost`-as-non-Page proof the epic was designed around (Concern 2 / vision bullet 1).

## Background

### What US-600-a left behind (the regression to fix)

US-600-a deleted the inline `CollapsiblePanelStack` from `LinkBody`. Before that, the bookmarks `LinkEditor` (which has **no** `page`) showed its panels via that inline stack on both browser surfaces. Now `LinkBody` renders **only** the center filtered-links list (+ pinned panel), so both browser surfaces lost their Categories/Tags/Hostnames panels (US-600-a Concern 8, accepted).

After US-600-a the Link panels are **host-agnostic**: they render only through `SecondaryViews`, and every owner call from the panels/editor is optional-chained (`page?.promoteSecondaryToMain?.(…)`, `page?.sidebarMandatory`). So US-601's job narrows to: **provide a host + mount the component on both surfaces + fix the link-open routing** (see Concern A).

### The two browser surfaces today

Both render `<LinkBody model={bookmarks.linkEditor} />` with a toolbar (breadcrumb + actions) above it:

| Surface | File | Body today |
|---|---|---|
| `BlankPageLinks` | `BrowserView.tsx:278-300` | `Panel(column)`: toolbar (`LinkBreadcrumbBits` + `LinkActionBits`) → `Panel(flex=1)` wrapping `<LinkBody>` |
| `BookmarksDrawer` | `BookmarksDrawer.tsx:104-135` | slide-in `Panel(column)` of fixed `width` (`bookmarksWidth`): toolbar → `<LinkBody>` → footer (`LinkFooterBits`) |

`BlankPageLinks` is mounted per-blank-tab inside `PageManager` (`BrowserView.tsx:643-647`, gated on `isBlank && bookmarksReady && model.bookmarks`). `BookmarksDrawer` is mounted once (`BrowserView.tsx:679-687`), returns `null` unless `open` (`bookmarksOpen`).

### The bookmarks `LinkEditor` (owned by `BrowserBookmarks`)

`BrowserBookmarks` (`BrowserBookmarks.ts`) owns a private `TextFileModel` (the `.link.json` host) + a `LinkEditor`. In `init()` (`:41-70`) it calls `linkEditor.adoptHost(textFileHost)` + `loadData(...)` but **never attaches the editor to a page** — so `linkEditor.page === null` today. `adoptHost` already sets `this.secondaryView = LINK_PANELS` (`LinkEditor.ts:303`) and calls `_seedActivePanel()` (a no-op while `page` is null). Auto-save to disk is wired via a `textFileHost.state` subscription (`:64-68`).

The browser sets two duck-typed hooks on the bookmarks editor (`BrowserEditor.ts:138-153` preload + `:169-184` init) — these are **the browser's routing mechanism**:
```ts
bm.linkEditor.onLinkOpen = (data) => {
    data.target = "browser";
    data.browserPageId = this.page?.id;
    const s = this.state.get();
    const currentTab = s.tabs.find((t) => t.id === s.activeTabId);
    const currentUrl = currentTab?.url || "";
    if (!currentUrl || currentUrl === "about:blank") data.browserTabMode = "navigate";
};
bm.linkEditor.onGetLinkMenuItems = (link) => /* "Open in New Tab" */;
```
`onLinkOpen` is **only** fired by `LinkEditor.openLink()` (`LinkEditor.ts:1139-1150`), which the center list/tiles use (`LinkItemList.tsx:63`, `LinkItemTiles.tsx:48`). `onLinkOpen` is **never** set anywhere except the browser, so its presence is a reliable "I am an embedded browser editor" discriminator.

### How the page mounts `SecondaryViews` (the template to mirror)

`Pages.tsx:47-58`:
```tsx
function SecondaryViewsContent({ page }) {
    const nav = page.ensureSecondaryViewsModel();
    const state = nav.state.use();          // open/width/activePanel
    page.state.use((s) => s.version);       // re-derive views on attach/detach
    return <SecondaryViews views={page.panelEditors} state={state} setState={page.setSecondaryViewsState} />;
}
```
`SecondaryViews` (`SecondaryViews.tsx`) is **controlled + presentational**: it reads `views`/`state`/`setState`, owns its container `Panel` + `Splitter`, returns `null` when `!state.open`, renders a `CollapsiblePanelStack` of each view's registered panels, and portals each panel's header into a `headerRef`. It subscribes to no store. It needs an owner exposing: a reactive `state` with a `version` counter, `panelEditors`, an `ISecondaryViewsState` (via `ensureSecondaryViewsModel().state`), and a `setSecondaryViewsState` carrying side effects.

### `IPageHost` — the contract `BrowserPanelHost` must satisfy

`IPageHost` (`api/pages/IPageHost.ts`) required core (every host): `id`, `state: TOneState<IPageState>`, `panelEditors`, `activePanel`, `hasSidebar`, `expandPanel`, `setActivePanel`, `setSecondaryViewsState`, `secondaryViewsModel`, `ensureSecondaryViewsModel`, `canOpenNavigator`, `toggleNavigator`, `removeSecondaryView`, `getTransient`, `setTransient`. Optional: `sidebarMandatory?`, `pinned?`, and the **main-editor-navigation** group (`mainEditor?`, `mainEditorInstance?`, `switchMainEditor?`, `promoteSecondaryToMain?`).

`EditorModel.isMain` (`EditorModel.ts:183`) = `this.page?.mainEditorInstance === this`. Epic Concern 2b: **Browser host → `isMain` true for the embedded Link editor.** Achieved by having `BrowserPanelHost.mainEditorInstance` **return the bookmarks `linkEditor`** (it's an optional member — providing it is allowed) while still **omitting** `switchMainEditor`/`promoteSecondaryToMain` (no main-editor swapping in the browser). Result: `isMain === true` → the Category panel's `if (!vm.isMain) vm.page?.promoteSecondaryToMain?.(vm)` short-circuits (never promotes), and `LinkCategorySecondaryView`'s Save button (gated on `!isMainEditor`) stays hidden (bookmarks auto-save already).

### What `LinkEditor.setPage(host)` triggers

`LinkEditor.setPage` (`LinkEditor.ts:372-379`): calls `super.setPage`, forwards `this._host?.setPage(page)`, and (if `contributesPanels()`) calls `_seedActivePanel()` → `page.expandPanel(map[expandedPanel])`. Because `expandedPanel` is restored from the HS1 host slot in `adoptHost` (`:323-332`), **the active panel restores for free** once the editor is attached to `BrowserPanelHost` — no extra persistence needed for `activePanel`.

## Target design

```
BrowserBookmarks
 ├─ textFileHost: TextFileModel        (the .link.json)
 ├─ linkEditor:   LinkEditor           (secondaryView = LINK_PANELS, always-on)
 └─ panelHost:    BrowserPanelHost     ← NEW (IPageHost)
        ├─ attach(linkEditor)  → linkEditor.setPage(panelHost) → seeds active panel
        ├─ panelEditors        → [linkEditor]
        ├─ secondaryViewsModel → { open:true, width, activePanel } (open forced)
        ├─ sidebarMandatory    → true
        ├─ mainEditorInstance  → linkEditor   (⇒ linkEditor.isMain === true)
        └─ setSecondaryViewsState → fires panelExpanded (drives LinkBody breadcrumb sync)
```

Both `BlankPageLinks` and `BookmarksDrawer` change their body from a single `<LinkBody>` to a **row**: `<SecondaryViews … />` (left) + `<LinkBody>` (right) — mirroring the page layout (`Pages.tsx`). Because there is exactly **one** `linkEditor` (and `editor.page` is a single pointer), there is exactly **one** `BrowserPanelHost` and **one** shared `ISecondaryViewsState`; both surfaces render the same panels from the same host (see Concern B for the simultaneous double-mount).

## Implementation Plan

> Order: (1) `BrowserPanelHost` class; (2) wire it into `BrowserBookmarks`; (3) fix link-open routing on the panels (Concern A); (4) mount `SecondaryViews` in `BlankPageLinks`; (5) mount in `BookmarksDrawer`; (6) persistence + dispose; (7) `tsc`/`eslint`; (8) manual smoke test.

### Step 1 — New `BrowserPanelHost` (`src/renderer/editors/browser/BrowserPanelHost.ts`)

A minimal `IPageHost`. Model the sidebar-state surface on `PageModel` but **drop** all tab/main-swap/persistence/Explorer-auto-init machinery.

- Fields: `readonly id = crypto.randomUUID()`; `readonly state = new TOneState<IPageState>({ ...defaultPageState })` (import `IPageState`/default shape — or inline the 4 fields); `secondaryViewsModel: SecondaryViewsModel | null = null`; a private `_editor: LinkEditor | null` + `_transient = new Map()`.
- `attach(editor)`: store `_editor = editor as LinkEditor`; `editor.setPage(this)`; subscribe to the editor's `secondaryView` slice to bump `state.version` (mirrors `PageModel.attach` `:215-219`); bump `version` + set `hasSidebar`. Then `ensureSecondaryViewsModel().setStateQuiet({ open: true })` (mandatory-open).
- `get panelEditors(): EditorModel[]` → `this._editor?.contributesPanels() ? [this._editor] : []`.
- `get hasSidebar()` → `!!this._editor?.contributesPanels()`.
- `get sidebarMandatory()` → `true`.
- `get mainEditorInstance(): EditorModel | null` → `this._editor` (⇒ `linkEditor.isMain === true`). **Omit** `switchMainEditor`/`promoteSecondaryToMain` (no main swap).
- `get activePanel()` / `set activePanel(v)` → back the `SecondaryViewsModel` activePanel (mirror `PageModel.ts:80-90`).
- `ensureSecondaryViewsModel()` → lazy-create `new SecondaryViewsModel()`, seed `activePanel`, subscribe its state → bump `state.version` (mirror `PageModel.ts:548-562`).
- `setSecondaryViewsState = (patch) => { … }` → mirror `PageModel.ts:432-454` **minus** the `sidebarMandatory` open-clamp branch (simplify to: always force `open:true`; apply `width` clamp + `activePanel`); on `activePanel` change, call `this._editor?.onPanelExpanded(panel)` **and** `panelExpanded.send({ pageId: this.id, panelId: panel })` — the `panelExpanded` fire is what drives `LinkBody`'s breadcrumb/filter sync (`LinkBody.tsx:29-44`, keyed on `model.page?.id`). Do **not** fire `secondaryViewsToggled` (open never changes).
- `setActivePanel(p)` → `setSecondaryViewsState({ activePanel: p })`. `expandPanel(id)` → guard the editor owns `id`, then `setActivePanel(id)` (mirror `PageModel.ts:462-467`).
- Transient: `getTransient`/`setTransient` (mirror `PageModel.ts:102-113`).
- Stub the remaining required `IPageHost` members that are meaningless here: `canOpenNavigator() => false`, `toggleNavigator: async () => {}`, `removeSecondaryView: async () => {}`. (They exist on the interface but the browser surfaces never call them.) `pinned?` omitted.
- **No** `_maybeAutoInitExplorer` / `_explorerRootForPanels` / `findExplorer` — the browser must **not** spawn a file Explorer next to the bookmarks panels (PageModel's auto-init from US-600-a is Page-only).
- `dispose()`: detach (`_editor?.setPage(null)`), drain the slice sub, `secondaryViewsModel?.dispose()`.

### Step 2 — Wire `BrowserPanelHost` into `BrowserBookmarks` (`BrowserBookmarks.ts`)

- Add `readonly panelHost: BrowserPanelHost` (construct in the ctor or lazily in `init`).
- In `init()` after `adoptHost(...)` + `loadData(...)` (`:57-58`): `this.panelHost.attach(this.linkEditor);`. This sets `linkEditor.page = panelHost` and (via `LinkEditor.setPage`) seeds the active panel from the restored `expandedPanel`.
- In `dispose()` (`:72-77`): `this.panelHost.dispose()` **before** `this.linkEditor.dispose()` (detach first so the editor's `setPage(null)` runs cleanly).
- Seed the sidebar width from browser state if persisted (Concern C) — optional; default `240` is fine for MVP.

> **Host-on-host note:** `LinkEditor.setPage` also calls `this._host?.setPage(panelHost)` — i.e. the bookmarks `TextFileModel.page` becomes the `BrowserPanelHost`. `TextFileModel.setPage` is a plain field assignment; nothing in the bookmarks path reads `host.page` expecting a real `PageModel`. **Verify** during implementation (grep `\.page` on the TextFileModel path) — low risk.

### Step 3 — Fix panel link-open routing (Concern A — the central fix)

The panels open **links** via `app.events.openRawLink.sendAsync(createLinkData(navUrl, { sourceId, pageId, fallbackTarget: "monaco", … }))` directly (`LinkCategoryPanel.tsx:45-52`, `LinkTagsSecondaryView.tsx:67-74`, `LinkHostnamesNavigationPanel.tsx:67-74`) — this **bypasses `onLinkOpen`**, so in the browser a bookmark click would not route to the browser tab. Centralize the open through the model so the browser's `onLinkOpen` hook fires.

- **Add `LinkEditor.openLinkFromPanel(item: ILink, sourceId: string)`** encapsulating the routing decision:
  ```ts
  openLinkFromPanel = (item: ILink, sourceId: string): void => {
      if (item.id) this.selectLink(item.id);
      if (this.onLinkOpen) {
          // Embedded (browser) — route through the hook so it can set
          // target="browser" + browserPageId + navigate-vs-new-tab.
          void this.openLink(item);
          return;
      }
      // Page context — unchanged openRawLink path (byte-identical to today).
      const navUrl = this.treeProvider?.getNavigationUrl(item) ?? item.href;
      app.events.openRawLink.sendAsync(createLinkData(navUrl, {
          target: item.target || undefined,
          sourceId,
          category: item.category,
          ...(this.page ? { pageId: this.page.id, fallbackTarget: "monaco", title: item.title } : undefined),
      }));
  };
  ```
  The `onLinkOpen`-presence discriminator is reliable (set **only** by the browser). In the page context the produced `linkData` is identical to what the panels build today (`this.page.id` === the old `pageId`), so **page behavior is unchanged**.
- **Rewrite the three panels' link-click handlers** to call `vm.openLinkFromPanel(item, "link-category" | "link-tag" | "link-hostname")` instead of building `openRawLink` inline:
  - `LinkCategoryPanel.tsx:42-52` (the `else` / non-directory branch).
  - `LinkTagsSecondaryView.tsx:64-75` (`handleSelect`).
  - `LinkHostnamesNavigationPanel.tsx:64-75` (`handleSelect`).
  Each can drop its now-unused `app`/`createLinkData` import if no longer referenced, and the `pageId` prop becomes unnecessary for the open path (keep it only if still used elsewhere — it is not, once routing moves to the model; **verify** and remove the prop threading if dead).
- Category-**folder** clicks are unchanged (`setSelectedCategory` + optional-chained promote — a no-op in the browser).

> Alternative (lower-churn, rejected): pass a per-mount `onOpenLink` callback prop down to each panel. Rejected because it threads a callback through three components + the registry's `SecondaryViewProps`; the model-method approach keeps the panels host-agnostic and the routing decision in one place.

### Step 4 — Mount `SecondaryViews` in `BlankPageLinks` (`BrowserView.tsx`)

`BlankPageLinks` currently takes `{ bookmarks }`. Change its body so the area under the toolbar is a **row**: the sidebar + the links list.

- Add a small controlled wrapper (mirror `Pages.tsx:47-58`) — either inline in `BlankPageLinks` or a shared `BrowserSecondaryViews` helper reused by both surfaces (preferred, Step 5 reuses it):
  ```tsx
  function BrowserSecondaryViews({ host }: { host: BrowserPanelHost }) {
      const nav = host.ensureSecondaryViewsModel();
      const state = nav.state.use();
      host.state.use((s) => s.version);
      return <SecondaryViews views={host.panelEditors} state={state} setState={host.setSecondaryViewsState} />;
  }
  ```
- In `BlankPageLinks`, wrap the existing toolbar + a `Panel(direction="row")` containing `<BrowserSecondaryViews host={bookmarks.panelHost} />` then the existing `<Panel flex={1}><LinkBody …/></Panel>`.
- Pass `bookmarks.panelHost` in (it's reachable via `bookmarks`).

### Step 5 — Mount `SecondaryViews` in `BookmarksDrawer` (`BookmarksDrawer.tsx`)

- Add the sidebar inside `bookmarks-editor-host` (`:122-124`): change that `Panel` to `direction="row"` and render `<BrowserSecondaryViews host={bookmarks.panelHost} />` before `<LinkBody …>`.
- The drawer's outer `bookmarksWidth` is the **whole drawer** width; the `SecondaryViews` internal `width` is a separate dimension (its own `Splitter`). Both coexist (drawer-resize vs sidebar-resize). Keep the toolbar + footer as-is.

### Step 6 — Persistence + lifecycle (Concern C)

- **`activePanel`** restores for free (rides the LinkEditor HS1 `expandedPanel` slot → `_seedActivePanel` on attach). No work.
- **Sidebar width** (decided — persist, Concern C): add `bookmarksSidebarWidth?: number` to `BrowserEditorState` (`BrowserEditorModel.ts`, near `bookmarksWidth` `:198`) + include it in `getRestoreData`/`applyRestoreData` (`BrowserEditor.ts:367` / `:406`, mirroring `bookmarksWidth`). Seed `panelHost`'s `SecondaryViewsModel.width` from it in `BrowserBookmarks.init`, and write it back to browser state when `setSecondaryViewsState({ width })` fires (the `panelHost` needs a callback into the `BrowserEditorModel`, or `BrowserBookmarks` subscribes to the `SecondaryViewsModel` and mirrors width → `model.state`).
- **`open`** is always `true` (mandatory) — never persisted.

### Step 7 — Verify
`npx tsc --noEmit` + `npx eslint` on changed files.

### Step 8 — Manual smoke test
1. Configure a bookmarks file with categories/tags/hostnames. Open a browser page → empty `about:blank` tab shows `BlankPageLinks` with the **sidebar** (Categories/Tags/Hostnames) restored, center links list to its right.
2. Click a **category folder** in the sidebar → center list filters; no new file/tab opens (promote is a no-op).
3. Click a **link** in the Categories panel tree → it opens **in the browser** (navigates the current blank tab, or new tab if Ctrl/non-blank) — **not** as a monaco file. Same for **Tags** and **Hostnames** bottom-list link clicks.
4. Switch active panel (Categories↔Tags↔Hostnames) → the toolbar **breadcrumb** updates in lockstep (the `panelExpanded` sync).
5. Click **"Open Bookmarks"** → the drawer slides in over the page and shows the **same** sidebar + links; selecting/opening behaves identically.
6. Add/edit a bookmark (star button / Add Link) → categories/tags/hostnames update live; the file auto-saves.
7. Sidebar resize persists across reopen (if Step 6 persistence done); active panel restores to the last-used one after reopening the browser page.
8. Incognito/Tor browser pages (separate bookmarks files) — panels still work; no Explorer panel ever appears next to the bookmarks panels.

## Concerns / Open Questions

### Concern A — Panel link clicks bypass `onLinkOpen` (browser routing). **RESOLVED (user, 2026-06-05): centralize the open path.**
The Category/Tags/Hostnames panels dispatch `openRawLink` directly with `fallbackTarget:"monaco"` + `pageId`, bypassing the browser's `onLinkOpen` hook (which sets `target:"browser"`, `browserPageId`, and navigate-vs-new-tab). In a page that's correct (opens the file in the page's main view); in the browser it would open a bookmark as a monaco file instead of navigating the browser. **Resolution (confirmed):** centralize via `LinkEditor.openLinkFromPanel(item, sourceId)` that routes through `openLink()` (firing `onLinkOpen`) when `onLinkOpen` is set (browser), else uses the existing `openRawLink` path (page). The discriminator (`onLinkOpen` set only by the browser) is reliable; page behavior is byte-identical. **A sidebar link click navigates the browser empty page to that link** — i.e. `onLinkOpen`'s existing rule: navigate the current tab when it is blank (`about:blank`), otherwise open a new tab (and Ctrl/Cmd-click always opens a new tab). The per-mount callback-prop alternative is rejected.

### Concern B — One editor, two simultaneous `SecondaryViews` mounts. **RESOLVED (user, 2026-06-05): accept the double-mount.**
On a blank tab with the drawer open, **both** `BlankPageLinks` (z-index 3) and `BookmarksDrawer` (z-index 6, with backdrop) are mounted, so `SecondaryViews` mounts **twice** for the same `linkEditor`. Because `editor.page` is a single pointer there is exactly one `BrowserPanelHost`/`ISecondaryViewsState`; both mounts render the same panels and share width/activePanel (consistent). Each mount owns its own `headerRef`s, so the header portals don't collide; the panel components tolerate multiple instances (they already do across page + grouped page). **Resolution (confirmed):** accept the double-mount — no suppression logic. (The optional "suppress `BlankPageLinks`'s sidebar while `bookmarksOpen`" polish is **not** done.)

### Concern C — Sidebar-state persistence boundary (epic Concern 4). **RESOLVED (user, 2026-06-05): persist the sidebar width in browser state.**
`activePanel` restores for free via the LinkEditor HS1 slot. The **sidebar width** is persisted via a new `bookmarksSidebarWidth?: number` on `BrowserEditorState` (Step 6 — wired through `getRestoreData`/`applyRestoreData`, seeded into the `panelHost` `SecondaryViewsModel` in `BrowserBookmarks.init`, written back when `setSecondaryViewsState({ width })` fires). `open` is always mandatory-true, never persisted. The transient MVP fallback is **not** used.

### Concern D — `isMain` / Save button / promote in the browser. **Resolved by design.**
`BrowserPanelHost.mainEditorInstance` returns the embedded `linkEditor` ⇒ `isMain === true`. So: the Category-folder click's `if (!vm.isMain) promote…` short-circuits (never promotes — correct, no main swap in the browser); `LinkCategorySecondaryView`'s Save button (gated `!isMainEditor`) stays hidden (bookmarks already auto-save via the `BrowserBookmarks` host subscription). `switchMainEditor`/`promoteSecondaryToMain` remain **omitted**.

### Concern E — No Explorer auto-init in the browser. **Resolved by not implementing it.**
US-600-a added `PageModel._maybeAutoInitExplorer` (auto-creates a file Explorer next to mandatory panels rooted at the file's folder). `BrowserPanelHost` deliberately **does not** implement it — the bookmarks sidebar must show only the three Link panels, never a file Explorer. (It's Page-class-only code; the new host simply omits it.)

### Concern F — Retiring `BlankPageLinks` bespoke chrome. **RESOLVED (user, 2026-06-05): keep it as a thin wrapper.**
The epic listed "retire `BlankPageLinks`" as a goal, but the toolbar (breadcrumb + actions) is still needed and lives **outside** `LinkBody`. **Decision (confirmed):** keep `BlankPageLinks` as a thin wrapper (toolbar + `BrowserSecondaryViews` + `LinkBody`) — the "bespoke" part (the inline panel duplication) is already gone after US-600-a. Full structural retirement is **not** done this task (can be a later follow-up if ever needed).

### Concern G — `host.setPage` on the bookmarks `TextFileModel`. **Verify (low risk).**
`LinkEditor.setPage` forwards `this._host?.setPage(panelHost)`, so the bookmarks `TextFileModel.page` becomes a `BrowserPanelHost`. `setPage` is a field assignment; nothing on the bookmarks path is known to read `host.page` as a `PageModel`. Verify with a grep during implementation.

### Out of scope
- Notebook/Todo/Rest Client migrations — Phase 3 (US-602–604).
- `secondary-views.md` doc drift / `/review` / `/userdoc` — epic close-out **US-607** (per the deferred-review model).

## Acceptance Criteria

- [ ] `npx tsc --noEmit` and `npm run lint` pass with zero errors.
- [ ] `BrowserPanelHost` implements `IPageHost`, reports `sidebarMandatory:true`, returns the bookmarks `linkEditor` from `mainEditorInstance` (⇒ `isMain:true`), and omits `switchMainEditor`/`promoteSecondaryToMain`.
- [ ] Both `BlankPageLinks` and `BookmarksDrawer` render the Categories/Tags/Hostnames panels via `SecondaryViews` (sidebar left, links list right); the toolbar breadcrumb stays in sync with the active panel.
- [ ] A **link** click in any sidebar panel (Categories tree, Tags/Hostnames bottom list) **navigates the browser** (current blank tab, or a new tab on Ctrl/non-blank) — never opens a monaco file.
- [ ] A **category-folder** click filters only (no promote/new tab); **tag/hostname** select filters only.
- [ ] No file Explorer panel ever appears next to the bookmarks panels.
- [ ] Bookmarks add/edit/auto-save still work; the star button + "Open in New Tab" context item still work.
- [ ] (If in scope) sidebar width persists across browser-page reopen; active panel restores from the last-used panel.
- [ ] No crash/console errors on a fresh browser page, on opening the drawer over a blank tab, or in incognito/Tor pages.

## Files Changed (summary — projected)

| Area | File | Change |
|---|---|---|
| New host | `editors/browser/BrowserPanelHost.ts` | **NEW** — minimal `IPageHost`: owns the bookmarks `linkEditor` + a `SecondaryViewsModel`; `sidebarMandatory:true`; `mainEditorInstance→linkEditor`; `setSecondaryViewsState` fires `panelExpanded`; **no** Explorer auto-init / main-swap |
| Bookmarks owner | `editors/browser/BrowserBookmarks.ts` | add `panelHost`; `panelHost.attach(linkEditor)` in `init` (after `adoptHost`); `panelHost.dispose()` before `linkEditor.dispose()`; (opt.) seed sidebar width |
| Open routing | `editors/link-editor/LinkEditor.ts` | add `openLinkFromPanel(item, sourceId)` — routes via `openLink` (fires `onLinkOpen`) when embedded (browser), else existing `openRawLink` path *(Concern A)* |
| Category panel | `editors/link-editor/panels/LinkCategoryPanel.tsx` | link branch → `vm.openLinkFromPanel(item, "link-category")`; drop dead `pageId`/`createLinkData`/`app` use if unreferenced |
| Tags nav panel | `editors/link-editor/panels/LinkTagsSecondaryView.tsx` (`LinkTagsNavigationPanel`) | `handleSelect` → `editor.openLinkFromPanel(item, "link-tag")` |
| Hostnames nav panel | `editors/link-editor/panels/LinkHostnamesNavigationPanel.tsx` | `handleSelect` → `editor.openLinkFromPanel(item, "link-hostname")` |
| Blank page mount | `editors/browser/BrowserView.tsx` (`BlankPageLinks`) | body → row of `<SecondaryViews>` (via shared `BrowserSecondaryViews`) + `<LinkBody>` |
| Drawer mount | `editors/browser/BookmarksDrawer.tsx` | `bookmarks-editor-host` → row of `<SecondaryViews>` + `<LinkBody>` |
| Persistence (opt.) | `editors/browser/BrowserEditorModel.ts` + `BrowserEditor.ts` | add `bookmarksSidebarWidth?` to state + `getRestoreData`/`applyRestoreData` *(Concern C)* |
| Epic doc | `doc/epics/EPIC-029.md` | mark US-601 detailed/in-progress |

**Explicitly NOT changed:** `SecondaryViews.tsx` / `SecondaryViewsModel.ts` (already host-agnostic); the three panel registrations (`register-editors.ts`); `LinkBody.tsx` (already center-only after US-600-a); `PageModel`'s Explorer auto-init (Page-only); `IPageHost.ts` (the optional members US-601 needs already exist — `mainEditorInstance?`, `sidebarMandatory?`).
