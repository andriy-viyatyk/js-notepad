# US-555: Link editor migration (EPIC-028 Phase C)

> **Status:** Investigation complete 2026-05-23, ready for implementation.
> **Walkthrough:** [`doc/epics/EPIC-028-editor-architecture/walkthroughs/24-link.md`](../../epics/EPIC-028-editor-architecture/walkthroughs/24-link.md) (LK1–LK10 RESOLVED in design, 2026-05-20).
> **Risk profile:** Highest of the Tier-5 text-bearing migrations so far. **First sidebar-owning editor in v4** — two new lifecycle-hook overrides (`beforeNavigateAway` + `onMainEditorChanged`). 19-file folder. Two live embed paths (Browser BlankPage + BookmarksDrawer) MUST keep working through the migration.

## Goal

Migrate the Link collection editor (`.link.json` files) from the legacy `LinkViewModel` + `LegacyEditorAdapter` pair to a native v4 `LinkEditor` class with `TextFileModel` as its `IContentHost`. Seventh Tier-5 editor in the uniform shape (after Monaco, Grid, LogView, Markdown, Svg, Html, Mermaid, Graph, Draw). Retires the view-side "demote survives as secondary" cleanup-function hack and three duck-typed `(m as any).treeProvider = …` writes. Preserves the legacy `LinkViewModel` + today's React view for browser-embed and future notebook-embed.

## Background

### Today's surface

`src/renderer/editors/link-editor/` — 19 files:

| Group | Files |
|-------|-------|
| Core | `LinkViewModel.ts`, `LinkEditor.tsx` (React view), `linkTypes.ts`, `LinkTreeProvider.ts`, `linkTraits.ts` |
| Center surfaces | `LinksList.tsx`, `LinksTiles.tsx`, `LinkItemList.tsx`, `LinkItemTiles.tsx`, `PinnedLinksPanel.tsx`, `EditLinkDialog.tsx`, `LinkTooltip.tsx` |
| In-editor sidebar panels | `panels/LinkCategoryPanel.tsx`, `panels/LinkTagsPanel.tsx`, `panels/LinkHostnamesPanel.tsx` |
| Secondary-editor wrappers | `panels/LinkCategorySecondaryEditor.tsx`, `panels/LinkTagsSecondaryEditor.tsx`, `panels/LinkHostnamesSecondaryEditor.tsx` |

### Two live embed sites (CRITICAL — preserve through migration)

1. **`BrowserEditorView.tsx:308` — `<BlankPageLinks>`** renders `<LinkEditor model={bookmarks.textModel} toolbarRefFirst={…} toolbarRefLast={…} />`. Drives the empty-tab bookmark surface. Consumes legacy `LinkViewModel` via the host's `acquireViewModel("link-view")` machinery inside `LinkEditor.tsx`.
2. **`BookmarksDrawer.tsx:130`** renders `<LinkEditor model={bookmarks.textModel} swapLayout toolbarRefFirst={…} toolbarRefLast={…} footerRefLast={…} />`. Drives the bookmarks side-drawer.
3. **`BrowserBookmarks.ts:54`** calls `textModel.acquireViewModel("link-view")` — the same ref-counted LinkViewModel is shared across both embed sites.

These are NOT page-level Link pages — they live inside a Browser page. `page.mainEditor` is `BrowserEditorModel`, not LinkEditor. The legacy `LinkViewModel` + `useContentViewModel` machinery + today's `LinkEditor.tsx` view **MUST stay alive verbatim** through this migration. Browser-editor migration (US-558) retires the embed path later.

### LinkViewModel state today (16 fields)

```typescript
{
    data: LinkEditorData,                              // root file shape — derived from host.content
    error?: string,
    leftPanelWidth: 200,
    expandedPanel: "categories" | "tags" | "hostnames",
    // Derived from data.links (recomputed on data change):
    categories: string[], categoriesSize: Record<string, number>,
    tags: string[], tagsSize: Record<string, number>,
    hostnames: string[], hostnamesSize: Record<string, number>,
    // Filtering:
    selectedCategory: "", selectedTag: "", selectedHostname: "",
    searchText: "", filteredLinks: [] as LinkItem[],
    // Selection:
    selectedLinkId: "",
}
```

Plus 7 private fields (lastSerializedData, skipNextContentUpdate, selectionRestored, lastFilterState, _treeProvider, gridModel, containerElement) and 2 optional callback fields (`onLinkOpen`, `onGetLinkMenuItems`).

### Selection-state cache file today

`<host.id>:link-editor` cache file via `host.stateStorage.setState(host.id, "link-editor", JSON.stringify({expandedPanel, selectedCategory, selectedTag, selectedHostname}))` — debounced 300ms; read once on first `loadData` via `selectionRestored` one-shot guard.

### JSON self-write pattern today

```
state mutation
  → onDataChangedDebounced (300ms)
    → onDataChanged:
        if (data === lastSerializedData) return;       // ref-equality skip
        skipNextContentUpdate = true;
        host.changeContent(JSON.stringify({type:"link-editor", ...data}, null, 4), true);
host content subscription fires onContentChanged(content):
  if (skipNextContentUpdate) { skipNextContentUpdate = false; return; }
  loadData(content);                                    // external change re-parse
```

Same shape as LogView (LV6) and Graph (GR7) — second instance under EPIC-028. Will be third under US-555 (LK5).

### Three render modes for `LinkCategoryPanel`

| Mode | Renderer | Trigger | Props (today) | Props (after) |
|------|----------|---------|---------------|---------------|
| Main-editor, sidebar-closed | `LinkEditor.tsx` (in-editor) | `!showPanelsInSidebar` | `useOpenRawLink=false, categoriesOnly=false` | unchanged |
| Main-editor, sidebar-open | `LinkCategorySecondaryEditor.tsx` `isMainEditor=true` branch | `mainEditor === model && navigatorOpen` | `useOpenRawLink=false, categoriesOnly=true` | unchanged |
| Standalone-secondary (LinkEditor demoted / attached alongside different main) | `LinkCategorySecondaryEditor.tsx` `isMainEditor=false` branch | `mainEditor !== model && model in secondaryEditors` | `useOpenRawLink=true, categoriesOnly=false, pageId` | unchanged |

Panels are pure components — only the source of the props changes.

### Today's view-side "demote survives" cleanup function (LinkEditor.tsx:144-152)

```typescript
return () => {
    const page = model.page;
    // Don't clear panels if this model was demoted to secondary-only
    if (page && page.mainEditor !== model && page.secondaryEditors.includes(model)) {
        return;
    }
    model.secondaryEditor = undefined;
};
```

The early-return is the "demote survives as secondary" hack — LinkEditor used to be `mainEditor`, the user navigated to a different file, `PageModel.setMainEditor` left LinkEditor in `secondaryEditors[]` because `model.secondaryEditor` was non-empty. The view's cleanup must NOT destroy panels in this case.

Under US-555, this view-side hack disappears entirely — model-side `beforeNavigateAway` (LK7) keeps `secondaryEditor` set when `contributesPanels()` is true, and `onMainEditorChanged` (LK8) reshapes the panel list to standalone-secondary form (drops `link-hostnames`).

### Today's duck-typed model decoration (LinkCategorySecondaryEditor.tsx:37-52)

```typescript
useEffect(() => {
    if (!vm || isMainEditor) return;
    const m = model as any;
    m.treeProvider = vm.treeProvider;
    if (!m.selectionState) {
        m.selectionState = new TOneState<NavigationState>({ selectedHref: null });
    }
    m.selectByHref = (href: string) => { /* ... */ };
    return () => {
        m.treeProvider = null;
        m.selectByHref = null;
    };
}, [vm, model, isMainEditor]);
```

Three `(m as any)` writes onto the model that downstream `findTreeProviderHost` callers (in `CategoryEditor.tsx` and `PagesLifecycleModel.ts`) duck-type-check via `"treeProvider" in editor`. Under LK9 the v4 `LinkEditor` class exposes `treeProvider` / `selectByHref` / `selectionState` as typed members directly — both duck-typed writes AND duck-typed reads compatibility through structural typing (the `"X" in editor` check passes against a real getter just fine).

### Today's dynamic panel updater (LinkCategorySecondaryEditor.tsx:57-71)

```typescript
useEffect(() => {
    if (!vm || isMainEditor) return;
    const updatePanels = () => {
        const hasTags = vm.state.get().tags.length > 0;
        const panels = ["link-category"];
        if (hasTags) panels.push("link-tags");
        const current = model.state.get().secondaryEditor;
        if (JSON.stringify(current) !== JSON.stringify(panels)) {
            model.secondaryEditor = panels;
        }
    };
    updatePanels();
    const unsub = vm.state.subscribe(updatePanels);
    return () => unsub();
}, [vm, model, isMainEditor]);
```

Retires under LK8: `onMainEditorChanged(newMain)` reshapes the panel list at demote-time; a model-side tags-slice subscription handles the tag-count-crosses-zero dynamic case inside the editor's `restore()`.

### Today's registration paths (register-editors.ts)

Two relevant blocks:

```typescript
// Legacy editorRegistry (line 458) — STAYS ALIVE for notebook + browser embed:
editorRegistry.register({
    id: "link-view", name: "Links", editorType: "textFile", category: "content-view",
    acceptFile: (fileName) => /\.link\.json$/i.test(fileName) ? 20 : -1,
    validForLanguage: (l) => l === "json",
    switchOption: (l, fn) => l === "json" && /\.link\.json$/i.test(fn ?? "") ? 10 : -1,
    isEditorContent: (l, c) => l === "json" && /"type"\s*:\s*"link-editor"/.test(c) && c.includes('"links"'),
    loadModule: async () => {
        const [module, { createLinkViewModel }] = await Promise.all([
            import("./link-editor/LinkEditor"),         // ← today's React view
            import("./link-editor/LinkViewModel"),
        ]);
        return { Editor: module.LinkEditor, createViewModel: createLinkViewModel, /* ... */ };
    },
});

// Three secondary-editor registrations (line 706 / 712 / 718):
secondaryEditorRegistry.register({ id: "link-category", label: "Categories", loadComponent: () => import(".../LinkCategorySecondaryEditor") });
secondaryEditorRegistry.register({ id: "link-tags",      label: "Tags",       loadComponent: () => import(".../LinkTagsSecondaryEditor") });
secondaryEditorRegistry.register({ id: "link-hostnames", label: "Hostnames",  loadComponent: () => import(".../LinkHostnamesSecondaryEditor") });

// v4 bridge mirror (line 761) — currently lists "link-view" as bare-adapter mirror.
const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set(["notebook-view", "todo-view", "link-view", "rest-client"]);
```

### `wrapLegacyForPage` callers that hit link-view today (PagesLifecycleModel.ts)

1. **`addEditorPage("link-view", "json", "untitled.link.json")`** — `tools-editors-registry.ts:94` (sidebar "New Link Page" button).
2. **`openLinks(links, title)`** — `PagesLifecycleModel.ts:422` — used by `app.pages.openLinks()` script API and by drag-and-drop of multi-link payloads.
3. **`openFile(filePath)`** for any `.link.json` file — registry resolves to `link-view`.

All three currently fall through to `LegacyEditorAdapter` in `wrapLegacyForPage` (no `link-view` branch exists). Under US-555 we add a `link-view` branch that constructs a `LinkEditor` over the TextFileModel host — mirror of the existing `graph-view` / `draw-view` branches (PagesLifecycleModel.ts:175 / 188).

### `findEditorsAccepting` title-fallback (already shipped in US-565)

`base/v4/editorRegistry.ts:113-114` falls back to `host.state.get().title` when `filePath` is undefined. Untitled `.link.json` pages from `addEditorPage("link-view", "json", "untitled.link.json")` get switch-widget buttons automatically. **No registry edit needed in US-555.**

### `findTreeProviderHost` consumer duck-typing (CategoryEditor.tsx:33 + PagesLifecycleModel.ts:194/270-307)

The consumer side uses `"treeProvider" in editor && "selectionState" in editor` checks. **A real getter `get treeProvider(): LinkTreeProvider | null` on the v4 LinkEditor class passes this check identically to the legacy duck-typed write.** No consumer-side edits needed; the duck-typed READS keep working.

What retires is the duck-typed **WRITER** side (the `m.treeProvider = vm.treeProvider; m.selectionState = …; m.selectByHref = …` block inside `LinkCategorySecondaryEditor`). Under LK9 the v4 LinkEditor exposes them natively; the secondary-editor wrapper no longer needs to inject them.

### HS1 — `host.editorSettings["link-view"]` slot (US-552-B contract)

`IContentHost.getEditorState<T>(editorId)` / `setEditorState<T>(editorId, value)` already shipped (TextEditorModel.ts:306-318). The 5 persisted fields per LK3 amendment ride the host slot:

```typescript
interface LinkViewSettings {
    leftPanelWidth?: number;
    expandedPanel?: "categories" | "tags" | "hostnames";
    selectedCategory?: string;
    selectedTag?: string;
    selectedHostname?: string;
}
```

The slot is seeded into editor state inside `adoptHost`; a slice-subscribe mirror writes back on changes. Today's `<host.id>:link-editor` cache file retires (orphan files linger harmlessly per P9).

### Sibling reference — Graph + Draw

Closest structural siblings: **Graph (US-564)** and **Draw (US-565)** — both ship `GraphEditor.ts` / `DrawEditor.ts` over `TextFileModel` host with:
- HS1 host-slot for a bounded UX setting (`groupingEnabled` / `darkMode`).
- `_skipNextContentUpdate` flag + fingerprint guard (Graph) or skipNext flag alone (Draw).
- Preserved legacy `*View.tsx` + `*ViewModel.ts` for notebook embedding.
- `wrapLegacyForPage` branch.
- `index.tsx` module wrapper with TextChrome composition.

The Link migration follows the same template, with one new dimension: **three secondary-editor panels and their two lifecycle hooks (`beforeNavigateAway` + `onMainEditorChanged`)**.

---

## Concerns resolved up front

Most concerns inherit verbatim from walkthrough 24's LK1–LK10 (all RESOLVED 2026-05-20). New investigation surfaced six retrospective concerns (LK11–LK16) carried from US-554/US-560/US-561/US-562/US-564/US-565 lessons.

### LK1 — Class topology

`LinkEditor` IS the page's `mainEditor`; HAS a `TextFileModel` content host with CONTENT_HOST_TRAIT exposed. **Seventh** Tier-5 editor in the uniform shape. Verbatim from walkthrough.

### LK2 — State slice partitioning

5 persisted (`leftPanelWidth`, `expandedPanel`, `selectedCategory`, `selectedTag`, `selectedHostname`) / 11 ride-state-stripped (`data`, `error`, `categories/Size`, `tags/Size`, `hostnames/Size`, `filteredLinks`, `searchText`, `selectedLinkId`) / 8 private (`_skipNextContentUpdate`, `_lastSerializedData`, `_lastFilterState`, `_treeProvider`, `_gridModel`, `_containerElement`, `onLinkOpen?`, `onGetLinkMenuItems?`). Verbatim.

### LK3 — Selection-state cache → HS1 host slot

Today's `<host.id>:link-editor` cache file retires. The 5 fields ride `host.editorSettings["link-view"]` per HS1 amendment. Survives Link↔Monaco switches AND app restarts. `selectionRestored` one-shot flag retires (host-slot seed in `adoptHost` replaces it). **Fourth instance** of "per-editor cache file → host slot" (Grid GR4 → LogView LV3 → Markdown MK / Mermaid MR5 / Graph GR4 / Draw DR4 → Link LK3).

### LK4 — JSON parse/serialize lifecycle hooks

Three sites: `restore()` (initial parse via `loadData(host.content)`), `adoptHost` (host content subscription with skipNext guard), `dispose()` (flush pending save). Verbatim from walkthrough.

### LK5 — `skipNextContentUpdate` flag

Verbatim port of today's editor-private flag. **Third instance** of the self-write-guard pattern (LogView LV6 → Graph GR7 → Link LK5; Draw DR7 also).

### LK6 — `setSidebarPanels(open)` model method

Pure state mutation: `state.secondaryEditor = LINK_PANELS` (open) or `undefined` (closed). Gated on `page.mainEditor === model` for demote-safe no-op. View-side useEffect becomes a pure dispatcher: `useEffect(() => editor.setSidebarPanels(isNavigatorOpen), [isNavigatorOpen])`. Verbatim.

### LK7 — `beforeNavigateAway(newModel)` override

Survives as secondary if `contributesPanels()` is true (i.e., the user had the Links sidebar open). Otherwise clears `secondaryEditor` and disposes cleanly. **First text-bearing-editor exercise** of the hook. Verbatim.

### LK8 — `onMainEditorChanged(newMainEditor)` override

Adjusts panel list to standalone-secondary shape: `["link-category", "link-tags"]` (with-tags) or `["link-category"]` (no tags). Drops `link-hostnames` to match today's `LinkCategorySecondaryEditor.updatePanels` behavior. Plus a model-side `state.tags`-slice subscription inside `restore()` to handle the tag-count-crosses-zero dynamic case. **First text-bearing-editor exercise** of the hook. Verbatim.

### LK9 — Typed accessors for TreeProvider

`get treeProvider(): LinkTreeProvider | null` (lazy via `_treeProvider` field), `selectByHref(href: string): void` public method, `selectionState: TOneState<NavigationState>` public field initialized in constructor. Three duck-typed `(m as any)` writes inside `LinkCategorySecondaryEditor` retire. **Consumer-side** duck-typed reads (`"treeProvider" in editor` checks in `CategoryEditor` and `PagesLifecycleModel`) keep working as-is because TS `in` operator returns true for getters. Verbatim, with the consumer-side compat note.

### LK10 — `accepts()` predicate + queue events

Filename `.link.json` priority 70 + content-peek priority 60 (`"type":"link-editor"` + `"links"`); queue events `{ focus }` only; queue request `never`. Verbatim.

### LK11 — File naming under preserved-legacy-view contract (NEW retrospective)

**Walkthrough deviation:** Walkthrough §Migration scope §Renamed files says "Today's `LinkEditor.tsx` renames to `LinkBody.tsx`". This contradicts US-554/US-560/US-561/US-562/US-564/US-565's retrospective preservation pattern (`*View.tsx` + `*ViewModel.ts` kept for notebook-embed). For US-555 we additionally have two browser-embed sites (BlankPageLinks + BookmarksDrawer) that depend on today's `LinkEditor.tsx`.

**Resolution:** Rename today's `LinkEditor.tsx` → `LinkView.tsx` (file rename only; exported function name `LinkEditor` is UNCHANGED). This:
- Frees the `LinkEditor` name for the v4 class file `LinkEditor.ts`.
- Aligns with the preserved-sibling pattern (`GraphView.tsx`, `DrawView.tsx`, `MermaidView.tsx`, `HtmlView.tsx`, `SvgView.tsx`, `MarkdownView.tsx`).
- Minimizes diff at consumer sites — only the import path string changes:
  ```typescript
  // Before:
  import { LinkEditor } from "../link-editor/LinkEditor";
  // After:
  import { LinkEditor } from "../link-editor/LinkView";
  ```
- Two consumer sites: `BrowserEditorView.tsx:39`, `BookmarksDrawer.tsx:4`. Plus legacy registry entry `register-editors.ts:480`.

The new v4 files: `LinkEditor.ts` (class), `LinkBody.tsx` (v4 view shell), `index.tsx` (module wrapper).

### LK12 — LinkTreeProvider source interface (NEW retrospective)

Today's `LinkTreeProvider` constructor takes `vm: LinkViewModel`. Under US-555 BOTH the legacy `LinkViewModel` (browser-embed, notebook-embed) AND the v4 `LinkEditor` (page-main) need to construct provider instances.

**Resolution:** Refactor `LinkTreeProvider.ts` to accept a structural source interface `ILinkSource` (defined in `linkTypes.ts`) that includes the methods/fields LinkTreeProvider consumes:
- `state: IState<LinkEditorState>` (read access to data.links + categories + categoriesSize + tags + tagsSize + hostnames + hostnamesSize)
- `addLink(item: Partial<LinkItem>): LinkItem`
- `getLinkById(id: string): LinkItem | undefined`
- `updateLink(id: string, updates: Partial<Omit<LinkItem, "id">>): void`
- `deleteLink(id: string, skipConfirm?: boolean): Promise<void>`
- `moveLinkToCategory(id: string, category: string): void`
- `pinLink(id: string): void`, `unpinLink(id: string): void`, `getPinnedLinks(): LinkItem[]`

Both `LinkViewModel` (verbatim — already has these) and v4 `LinkEditor` (newly authored — same method bodies relocated) satisfy `ILinkSource`. Constructor signature changes from `(vm: LinkViewModel, sourceUrl: string)` to `(source: ILinkSource, sourceUrl: string)`; method bodies replace `this.vm.X` with `this.source.X` (one-symbol rename across all methods).

### LK13 — Panel components dual-source typing (NEW retrospective)

Today's `LinkCategoryPanel` / `LinkTagsPanel` / `LinkHostnamesPanel` take `vm: LinkViewModel`. Under US-555 BOTH paths consume them.

**Resolution:** Change the `vm` prop typing to `LinkViewModel | LinkEditor` (TS union). The methods called by panels (`setSelectedCategory`, `setSelectedTag`, `setSelectedHostname`, `setExpandedPanel`, `setSearchText`, `setLeftPanelWidth`, `setViewMode`, `selectLink`, `state.use()`, `state.subscribe()`, `state.get()`, `treeProvider`, `getViewMode()`, `showLinkDialog()`, `getPinnedLinks()`, `isLinkPinned()`, `pinLink()`, `unpinLink()`, `togglePinLink()`, `setPinnedPanelWidth()`, `moveCategory()`, `getLinkById()`, `deleteLink()`, `updateLink()`, `importLinks()`, `openLink()`) all have identical signatures on both classes.

Same approach for `LinksList`, `LinksTiles`, `LinkItemList`, `LinkItemTiles`, `PinnedLinksPanel`, `EditLinkDialog`, `LinkTooltip` — all `vm: LinkViewModel` props become `vm: LinkViewModel | LinkEditor`.

The cleanest realization: introduce a `LinkSource` type alias in `linkTypes.ts`:
```typescript
export type LinkSource = LinkViewModel | LinkEditor;
```
Then panel props become `vm: LinkSource`. Single point of declaration; TS union narrowing handles the dual-source case.

### LK14 — `wrapLegacyForPage` `link-view` branch (NEW retrospective)

Mirror of `graph-view` (PagesLifecycleModel.ts:175-182) and `draw-view` (PagesLifecycleModel.ts:188-195) branches:

```typescript
if (isTextFile && targetEditorId === "link-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const link = new LinkEditor(
        new TComponentState({ ...defaultLinkEditorState, id }),
    );
    link.adoptHost(legacy as TextFileModel);
    // Initial JSON parse — mirrors today's LinkViewModel.onInit → loadData behavior.
    link.loadData((legacy as TextFileModel).state.get().content ?? "");
    return link;
}
```

Plus the top-of-file import:
```typescript
import { LinkEditor, defaultLinkEditorState } from "../../editors/link-editor";
```

Hits three call sites:
1. `addEditorPage("link-view", "json", "untitled.link.json")` — sidebar "New Link Page" button.
2. `openLinks(links, title)` — script API + drag-and-drop multi-link payload.
3. `openFile(filePath)` for `.link.json` files.

### LK15 — Registry mirror loop cleanup (NEW retrospective)

Remove `"link-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (register-editors.ts:761) so the mirror loop no longer ships the bare-adapter stub for it. Add a native v4 register call at the bottom of register-editors.ts (mirror of US-565 draw-view block at lines 1062-1088).

### LK16 — `page.asLink()` facade flip (NEW retrospective)

Mirror of Markdown/Mermaid/Graph/Draw facade flips. After `ensureEditor("link-view", …)` switches/promotes link-view, `page.mainEditorV4` IS a `LinkEditor`. The facade wraps it directly — no `acquireViewModel` round-trip needed:

```typescript
async asLink(force = false): Promise<LinkEditorFacade> {
    await this.ensureEditor("link-view", "Link", "asLink", force);
    const v4 = this.v4;
    if (!(v4 instanceof LinkEditor)) {
        throw new Error("asLink(): page is not a LinkEditor after switch");
    }
    return new LinkEditorFacade(v4);
}
```

The legacy `acquireViewModel("link-view")` + `releaseList.push(() => model.releaseViewModel("link-view"))` retire from PageWrapper.ts. **The legacy `acquireViewModel` machinery itself STAYS ALIVE** — BrowserBookmarks consumes it for embed; full retirement in US-557 (Notebook) / US-559.

`LinkEditorFacade.ts` constructor takes `LinkEditor` (was `LinkViewModel`); method bodies preserved (`this.vm.X` → `this.editor.X` — one-symbol rename across all methods).

---

## Implementation plan

### Phase 1 — Rename today's view file (LK11)

1. Rename `src/renderer/editors/link-editor/LinkEditor.tsx` → `src/renderer/editors/link-editor/LinkView.tsx`. Exported function name `LinkEditor` UNCHANGED.
2. Update import in `src/renderer/editors/browser/BrowserEditorView.tsx:39`:
   ```typescript
   import { LinkEditor } from "../link-editor/LinkView";
   ```
3. Update import in `src/renderer/editors/browser/BookmarksDrawer.tsx:4`:
   ```typescript
   import { LinkEditor } from "../link-editor/LinkView";
   ```
4. Update legacy registry `loadModule` in `src/renderer/editors/register-editors.ts:479-490`:
   ```typescript
   loadModule: async () => {
       const [module, { createLinkViewModel }] = await Promise.all([
           import("./link-editor/LinkView"),
           import("./link-editor/LinkViewModel"),
       ]);
       return {
           Editor: module.LinkEditor,
           createViewModel: createLinkViewModel,
           /* ... */
       };
   },
   ```
5. Verify: `tsc --noEmit` + `eslint` zero new errors.

### Phase 2 — Refactor LinkTreeProvider source interface (LK12)

1. Add `ILinkSource` interface in `src/renderer/editors/link-editor/linkTypes.ts`:
   ```typescript
   import type { IState } from "../../core/state/state";
   import type { ILink } from "../../api/types/io.tree";
   import type { LinkEditorState } from "./LinkViewModel";   // re-export type alias for cross-class sharing

   export interface ILinkSource {
       state: IState<LinkEditorState>;
       addLink(link?: Partial<LinkItem>): LinkItem;
       getLinkById(id: string): LinkItem | undefined;
       updateLink(id: string, updates: Partial<Omit<LinkItem, "id">>): void;
       deleteLink(id: string, skipConfirm?: boolean): Promise<void>;
       moveLinkToCategory(linkId: string, category: string): void;
       pinLink(id: string): void;
       unpinLink(id: string): void;
       getPinnedLinks(): LinkItem[];
   }
   ```
2. Refactor `src/renderer/editors/link-editor/LinkTreeProvider.ts`:
   - Constructor signature: `constructor(private readonly source: ILinkSource, sourceUrl: string)` (was `vm: LinkViewModel`).
   - Method bodies: replace `this.vm.X` → `this.source.X` (mechanical 1:1 rename across all methods).
3. Update `LinkViewModel.ts:94`:
   ```typescript
   this._treeProvider = new LinkTreeProvider(this, this.pageModel.filePath || "");
   ```
   No change needed at this call site — `this` already structurally satisfies `ILinkSource`.

### Phase 3 — Panel components dual-source typing (LK13)

1. Define `LinkSource` alias in `linkTypes.ts`:
   ```typescript
   import type { LinkViewModel } from "./LinkViewModel";
   import type { LinkEditor } from "./LinkEditor";
   export type LinkSource = LinkViewModel | LinkEditor;
   ```
   Note: `LinkEditor` here imports the NEW v4 class file (created in Phase 4). To break the forward dep, optionally define the interface fully in `linkTypes.ts` and have both classes `implements ILinkSource`.

2. Update prop types across the 13 affected files to take `vm: LinkSource` (or `model: LinkSource` where the prop is already `model`):
   - `panels/LinkCategoryPanel.tsx` — `vm: LinkSource`
   - `panels/LinkTagsPanel.tsx` — `vm: LinkSource`
   - `panels/LinkHostnamesPanel.tsx` — `vm: LinkSource`
   - `LinksList.tsx` — `model?: LinkSource` (if it accepts a model ref)
   - `LinksTiles.tsx` — `model: LinkSource`
   - `LinkItemList.tsx` — `model: LinkSource`
   - `LinkItemTiles.tsx` — `model: LinkSource`
   - `PinnedLinksPanel.tsx` — `model: LinkSource`
   - `EditLinkDialog.tsx` — call sites pass `vm: LinkSource` (dialog itself is free-standing; just data passing)
   - `LinkTooltip.tsx` — none (read-only component)
   - `LinkTreeProvider.ts` — already done in Phase 2

3. Verify: `tsc --noEmit` zero new errors.

### Phase 4 — Create v4 `LinkEditor.ts` (LK1 / LK2 / LK4 / LK5 / LK6 / LK7 / LK8 / LK9)

Create `src/renderer/editors/link-editor/LinkEditor.ts` (~400 LOC). Mirror of `GraphEditor.ts` / `DrawEditor.ts` structure. Key pieces:

```typescript
import { TComponentState } from "../../core/state/state";
import { TOneState } from "../../core/state/state";
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
import type { PageModel, NavigationState } from "../../api/pages/PageModel";
import { TextFileModel, newTextFileModel } from "../text/TextEditorModel";
import { editorRegistry as v4Registry } from "../base/v4/editorRegistry";
import { fpBasename } from "../../core/utils/file-path";
import { ui } from "../../api/ui";
import { debounce } from "../../../shared/utils";
import { splitWithSeparators } from "../../core/utils/utils";
import { getHostname } from "../../components/tree-provider/favicon-cache";
import type { RenderGridModel } from "../../uikit/RenderGrid";
import type { ILink, MenuItem } from "../../api/types/io.tree";
import type { ILinkData } from "../../../shared/link-data";
import { createLinkData } from "../../../shared/link-data";
import { LinkTreeProvider } from "./LinkTreeProvider";
import type { LinkItem, LinkEditorData, LinkViewMode, ILinkSource } from "./linkTypes";
import { showEditLinkDialog } from "./EditLinkDialog";

export type LinkQueueEvent = { type: "focus" };
export type LinkQueueRequest = never;

/** HS1 host-slot shape (LK3 amendment). */
interface LinkViewSettings {
    leftPanelWidth?: number;
    expandedPanel?: ExpandedPanel;
    selectedCategory?: string;
    selectedTag?: string;
    selectedHostname?: string;
}

export type ExpandedPanel = "tags" | "categories" | "hostnames";

export interface LinkEditorState extends EditorStateBase {
    // HS1 — ride host.editorSettings["link-view"] (LK3):
    leftPanelWidth: number;
    expandedPanel: ExpandedPanel;
    selectedCategory: string;
    selectedTag: string;
    selectedHostname: string;
    // View-derived — present on state for reactivity, stripped from getRestoreData (LK2):
    data: LinkEditorData;
    error: string | undefined;
    categories: string[];
    categoriesSize: Record<string, number>;
    tags: string[];
    tagsSize: Record<string, number>;
    hostnames: string[];
    hostnamesSize: Record<string, number>;
    filteredLinks: LinkItem[];
    // Transient UI state — not persisted (LK2):
    searchText: string;
    selectedLinkId: string;
}

export const defaultLinkEditorState: LinkEditorState = {
    id: "", title: "", modified: false, secondaryEditor: undefined,
    leftPanelWidth: 200,
    expandedPanel: "categories",
    selectedCategory: "", selectedTag: "", selectedHostname: "",
    data: { links: [], state: {} },
    error: undefined,
    categories: [], categoriesSize: {},
    tags: [], tagsSize: {},
    hostnames: [], hostnamesSize: {},
    filteredLinks: [],
    searchText: "",
    selectedLinkId: "",
};

const LINK_PANELS = ["link-category", "link-tags", "link-hostnames"];

function isLegacyTextFileHost(host: unknown): host is TextFileModel {
    return (host as { type?: string } | null)?.type === "textFile";
}

export class LinkEditor extends V4EditorModel<LinkEditorState, void, LinkQueueEvent>
    implements ILinkSource {
    readonly editorId = "link-view";

    private _host: TextFileModel | null = null;
    private _hostStateUnsub: (() => void) | null = null;
    private _hostContentUnsub: (() => void) | null = null;
    private _settingsUnsub: (() => void) | null = null;
    private _tagsSliceUnsub: (() => void) | null = null;        // LK8 tag-count subscription
    private _pendingHost: HostDescriptor | undefined = undefined;

    // LK5 — self-write guard. LK4 — ref-equality marker. Filter optimization:
    private skipNextContentUpdate = false;
    private lastSerializedData: LinkEditorData | null = null;
    private lastFilterState = { searchText: "", selectedCategory: "", selectedTag: "", selectedHostname: "", expandedPanel: "" };

    // LK9 — tree provider lazy; selection state public for CategoryEditor reads.
    private _treeProvider: LinkTreeProvider | null = null;
    readonly selectionState = new TOneState<NavigationState>({ selectedHref: null });

    // View refs (set by view; not on state):
    gridModel: RenderGridModel | null = null;
    containerElement: HTMLElement | null = null;

    // Optional callback fields (LK9 — preserved verbatim from LinkViewModel):
    onLinkOpen?: (data: ILinkData) => void;
    onGetLinkMenuItems?: (link: LinkItem) => MenuItem[];

    // Debounced save — today's pattern:
    private onDataChangedDebounced = debounce(() => this.onDataChanged(), 300);

    readonly typedQueue: ComponentQueue<LinkQueueEvent, LinkQueueRequest>;

    constructor(state: TComponentState<LinkEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<LinkQueueEvent, LinkQueueRequest>;

        const trait: IContentHostTrait = {
            extractContentHost: (): IContentHost => {
                const host = this._host;
                if (!host) throw new Error("Host already extracted from LinkEditor");
                this._hostStateUnsub?.();
                this._hostContentUnsub?.();
                this._settingsUnsub?.();
                this._tagsSliceUnsub?.();
                this._hostStateUnsub = null;
                this._hostContentUnsub = null;
                this._settingsUnsub = null;
                this._tagsSliceUnsub = null;
                this._treeProvider = null;
                this._host = null;
                return host as unknown as IContentHost;
            },
        };
        this.traits.add(CONTENT_HOST_TRAIT, trait);
    }

    // ── Host accessors ───────────────────────────────────────────────────
    get host(): TextFileModel | null { return this._host; }   // MK4 typed-host getter
    get contentHost(): IContentHost | null {
        return (this._host as unknown as IContentHost) ?? null;
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

    focus(): void { this.typedQueue.send({ type: "focus" }); }

    // ── LK9 — Tree provider exposure ────────────────────────────────────
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

    // ── Persistence (LK2 + LK3) ─────────────────────────────────────────
    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Descriptor collapses to identity-only. The 5 HS1 fields ride the host slot.
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

    applyRestoreData(data: RestoreData<LinkEditorState>): void {
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
        if (!trait) throw new Error(`LinkEditor.switchFrom: ${oldEditor.editorId} has no CONTENT_HOST_TRAIT`);
        const host = trait.extractContentHost() as unknown as TextFileModel;
        if (!isLegacyTextFileHost(host)) {
            throw new Error("LinkEditor.switchFrom: extracted host is not a TextFileModel");
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
            ui.notify((err as Error).message || "Failed to restore Link editor.", "error");
            this._host = newTextFileModel("");
            this.adoptHost(this._host);
        }
        this._pendingHost = undefined;
    }

    adoptHost(host: TextFileModel): void {
        this._host = host;
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._tagsSliceUnsub?.();

        // Forward host metadata to descriptorChanged (P3 debounce):
        this._hostStateUnsub = host.state.subscribe(() => this.descriptorChanged.send(undefined));

        // LK4 + LK5 — re-parse on external content changes, skipNext guard:
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
        const saved = host.getEditorState<LinkViewSettings>(this.editorId);
        if (saved) {
            this.state.update((s) => {
                if (saved.leftPanelWidth !== undefined)   s.leftPanelWidth = saved.leftPanelWidth;
                if (saved.expandedPanel !== undefined)    s.expandedPanel = saved.expandedPanel;
                if (saved.selectedCategory !== undefined) s.selectedCategory = saved.selectedCategory;
                if (saved.selectedTag !== undefined)      s.selectedTag = saved.selectedTag;
                if (saved.selectedHostname !== undefined) s.selectedHostname = saved.selectedHostname;
            });
        }

        // HS1 — mirror back. Slice-subscribe over a tuple object so any of
        // the 5 slots triggers a write but data/derived/transient changes don't.
        this._settingsUnsub = this.state.subscribe(
            () => {
                if (!this._host) return;
                const s = this.state.get();
                this._host.setEditorState<LinkViewSettings>(this.editorId, {
                    leftPanelWidth: s.leftPanelWidth,
                    expandedPanel: s.expandedPanel,
                    selectedCategory: s.selectedCategory,
                    selectedTag: s.selectedTag,
                    selectedHostname: s.selectedHostname,
                });
            },
            (s) => `${s.leftPanelWidth}|${s.expandedPanel}|${s.selectedCategory}|${s.selectedTag}|${s.selectedHostname}`,
        );

        // LK8 — tag-count-crosses-zero subscription. Reshape panel list on demote
        // when standalone-secondary and tag count changes (e.g., last tag deleted).
        this._tagsSliceUnsub = this.state.subscribe(
            () => {
                if (this.page?.mainEditor === this) return;        // we're main; LK6 handles
                if (!this.contributesPanels()) return;             // already detached
                const hasTags = this.state.get().tags.length > 0;
                this.secondaryEditor = hasTags ? ["link-category", "link-tags"] : ["link-category"];
            },
            (s) => s.tags.length > 0,
        );

        // LK4 — state subscription → debounced save (set up once during restore;
        // adoptHost may re-fire on switch-in — reset is fine since debounce is idempotent).
        this.addSubscription(this.state.subscribe(() => this.onDataChangedDebounced()));

        const { filePath, title } = host.state.get();
        this.state.update((s) => {
            s.title = title || (filePath ? fpBasename(filePath) : s.title || "untitled.link.json");
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

    // ── LK6 — Sidebar lifecycle hooks ───────────────────────────────────
    setSidebarPanels(open: boolean): void {
        if (this.page?.mainEditor !== this) return;          // demote-safe no-op
        if (open) {
            this.secondaryEditor = LINK_PANELS;
            const reverseMap: Record<string, string> = {
                categories: "link-category", tags: "link-tags", hostnames: "link-hostnames",
            };
            const panelToExpand = reverseMap[this.state.get().expandedPanel] ?? "link-category";
            this.page?.expandPanel(panelToExpand);
        } else {
            this.secondaryEditor = undefined;
        }
    }

    /** LK7 — preserve panels if user had sidebar open. */
    beforeNavigateAway(_newModel: V4EditorModel): void {
        if (this.contributesPanels()) {
            // Survive as standalone-secondary; onMainEditorChanged will reshape.
            return;
        }
        this.secondaryEditor = undefined;
    }

    /** LK8 — adjust panel set to standalone-secondary shape on demote. */
    onMainEditorChanged(newMainEditor: V4EditorModel | null): void {
        if (newMainEditor === this) return;
        if (newMainEditor === null) return;
        if (!this.contributesPanels()) return;               // already detached
        const hasTags = this.state.get().tags.length > 0;
        this.secondaryEditor = hasTags ? ["link-category", "link-tags"] : ["link-category"];
    }

    // ── JSON parse/serialize (LK4 / LK5 — relocated from LinkViewModel) ──
    loadData(content: string): void { /* verbatim from LinkViewModel.loadData */ }
    private onDataChanged = () => { /* verbatim from LinkViewModel.onDataChanged */ };

    // ── ILinkSource methods (relocated from LinkViewModel verbatim) ─────
    setExpandedPanel(panel: string): void { /* ... */ }
    setSelectedCategory(category: string): void { /* ... */ }
    setSelectedTag(tag: string): void { /* ... */ }
    setSelectedHostname(hostname: string): void { /* ... */ }
    setSearchText(text: string): void { /* ... */ }
    clearSearch(): void { /* ... */ }
    setLeftPanelWidth(width: number): void { /* ... */ }
    setGridModel(model: RenderGridModel | null): void { this.gridModel = model; }

    loadCategories(): void { /* ... */ }
    getCategoryCount(category: string): number { /* ... */ }
    loadTags(): void { /* ... */ }
    getTagCount(tag: string): number { /* ... */ }
    loadHostnames(): void { /* ... */ }
    getHostnameCount(hostname: string): number { /* ... */ }
    applyFilters(): void { /* ... */ }
    getViewMode(): LinkViewMode { /* ... */ }
    setViewMode(mode: LinkViewMode): void { /* ... */ }

    addLink(link?: Partial<LinkItem>): LinkItem { /* ... */ }
    importLinks(items: ILink[]): Promise<void> { /* ... */ }
    updateLink(id: string, updates: Partial<Omit<LinkItem, "id">>): void { /* ... */ }
    deleteLink(id: string, skipConfirm?: boolean): Promise<void> { /* ... */ }
    getLinkById(id: string): LinkItem | undefined { /* ... */ }
    moveLinkToCategory(linkId: string, category: string): void { /* ... */ }
    moveCategory(fromCategory: string, toCategory: string): Promise<void> { /* ... */ }

    isLinkPinned(id: string): boolean { /* ... */ }
    pinLink(id: string): void { /* ... */ }
    unpinLink(id: string): void { /* ... */ }
    togglePinLink(id: string): void { /* ... */ }
    reorderPinnedLink(fromIndex: number, toIndex: number): void { /* ... */ }
    getPinnedLinks(): LinkItem[] { /* ... */ }
    setPinnedPanelWidth(width: number): void { /* ... */ }

    showLinkDialog(linkId?: string): Promise<void> { /* ... */ }
    openLink(link: ILink | { href: string; target?: string }): Promise<void> { /* ... */ }

    refocus(): void { this.containerElement?.focus(); }

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
        this._hostStateUnsub?.();
        this._hostContentUnsub?.();
        this._settingsUnsub?.();
        this._tagsSliceUnsub?.();
        this._hostStateUnsub = null;
        this._hostContentUnsub = null;
        this._settingsUnsub = null;
        this._tagsSliceUnsub = null;
        this._treeProvider = null;
        this.containerElement = null;
        this.gridModel = null;
        if (this._host) {
            await this._host.dispose();
            this._host = null;
        }
        await super.dispose();
    }
}
```

The `/* ... */` bodies are byte-for-byte relocated from today's `LinkViewModel.ts`. All field reads using `this.host` / `this._host` instead of `this.pageModel`.

### Phase 5 — Create v4 `LinkBody.tsx` (LK6 + view shell)

Create `src/renderer/editors/link-editor/LinkBody.tsx` (~250 LOC). Mirror of today's `LinkView.tsx` rendered body, with:
- `useContentViewModel` → removed (replaced by direct prop typing).
- `useSyncExternalStore` → replaced by `editor.state.use((s) => ({...}))` reactive selector.
- Portal blocks → removed (toolbar moves to `LinkToolbarBits`, footer moves to `LinkFooterBits` — both in `index.tsx`).
- The secondary-editor-registration useEffect → replaced by ONE line:
  ```typescript
  const isNavigatorOpen = useOptionalState(model.page?.pageNavigatorModel?.state, (s) => s.open, false);
  useEffect(() => { editor.setSidebarPanels(isNavigatorOpen); }, [isNavigatorOpen, editor]);
  ```
- Cleanup function on unmount: NONE — `editor.setSidebarPanels(false)` is gated on `mainEditor === this` so demote-path is a no-op naturally.
- pageNavigatorToggled / panelExpanded global event subs preserved (translate panel-id ↔ expandedPanel).
- Center drop zone, view-mode menu, three-panel layout, pinned panel — preserved verbatim from `LinkView.tsx`.
- Queue focus handler: `editor.queue.use((ev) => { if (ev.type === "focus") editor.refocus(); });`

### Phase 6 — Create v4 `index.tsx` (LK6 + module export)

Create `src/renderer/editors/link-editor/index.tsx` (~150 LOC). Composes `<TextChrome>` + `<LinkBody>` + `<LinkToolbarBits>` + `<LinkFooterBits>`:

```typescript
import { TComponentState } from "../../core/state/state";
import { LinkEditor, defaultLinkEditorState } from "./LinkEditor";
import { LinkBody } from "./LinkBody";
import { TextChrome } from "../base/v4/TextChrome";
import { Breadcrumb, Button, IconButton, Input } from "../../uikit";
import { showAppPopupMenu } from "../../ui/dialogs";
import { CloseIcon, PlusIcon, /* view-mode icons */ } from "../../theme/icons";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

function LinkToolbarBits({ model }: { model: LinkEditor }) {
    const state = model.state.use((s) => ({
        expandedPanel: s.expandedPanel,
        selectedCategory: s.selectedCategory,
        selectedTag: s.selectedTag,
        selectedHostname: s.selectedHostname,
        searchText: s.searchText,
    }));
    const viewMode = model.getViewMode();
    return (
        <>
            {/* Breadcrumb (categories / tags / hostnames) */}
            {/* Add Link button */}
            {/* View Mode menu button */}
            {/* Search Input */}
        </>
    );
}

function LinkFooterBits({ model }: { model: LinkEditor }) {
    const { filteredCount, totalCount } = model.state.use((s) => ({
        filteredCount: s.filteredLinks.length,
        totalCount: s.data.links.length,
    }));
    return <span>{filteredCount === totalCount ? `${totalCount} links` : `${filteredCount} of ${totalCount} links`}</span>;
}

function LinkEditorView({ model }: { model: V4EditorModel }) {
    const linkEditor = model as LinkEditor;
    return (
        <TextChrome
            model={model}
            toolbarContributions={<LinkToolbarBits model={linkEditor} />}
            footerContributions={<LinkFooterBits model={linkEditor} />}
        >
            <LinkBody model={linkEditor} />
        </TextChrome>
    );
}

export const linkModule: EditorModule = {
    createEditor: () => new LinkEditor(new TComponentState({ ...defaultLinkEditorState })),
    Component: LinkEditorView,
};

export { LinkEditor, defaultLinkEditorState };
export type { LinkEditorState, LinkQueueEvent, ExpandedPanel } from "./LinkEditor";
```

Note: TextChrome's `toolbarContributions` slot is a SINGLE slot in walkthrough 09. Today's portal pattern has THREE slots (toolbarFirst, toolbarLast, footerLast). Under walkthrough 09 the breadcrumb (toolbarFirst) + buttons (toolbarLast) collapse into one `toolbarContributions` ReactNode that internally lays out the breadcrumb + spacer + buttons. Mirror of how Markdown / Graph composed their toolbars.

### Phase 7 — `wrapLegacyForPage` branch (LK14)

Edit `src/renderer/api/pages/PagesLifecycleModel.ts:21` import:
```typescript
import { LinkEditor, defaultLinkEditorState } from "../../editors/link-editor";
```

Add branch after the `draw-view` branch (line 195):
```typescript
// EPIC-028 / US-555 — Link migrated to native v4 module. Construct LinkEditor
// over the legacy TextFileModel host. The initial loadData() call kicks off
// inside adoptHost (mirrors today's LinkViewModel.onInit → loadData behavior).
if (isTextFile && targetEditorId === "link-view") {
    const id = legacy.state.get().id || crypto.randomUUID();
    const link = new LinkEditor(
        new TComponentState({ ...defaultLinkEditorState, id }),
    );
    link.adoptHost(legacy as TextFileModel);
    const content = (legacy as TextFileModel).state.get().content ?? "";
    link.loadData(content);
    return link;
}
```

### Phase 8 — Update secondary-editor wrappers (LK8 + LK9)

#### `panels/LinkCategorySecondaryEditor.tsx`

- Replace `useContentViewModel<LinkViewModel>(model as TextFileModel, "link-view")` with detection:
  ```typescript
  // Resolve the source: page main-editor is LinkEditor (v4-native) when this
  // panel is rendered as standalone-secondary above a Link page; for browser-
  // embed paths the model IS a TextFileModel and we still acquire LinkViewModel.
  const linkEditor = page?.mainEditorV4 instanceof LinkEditor ? page.mainEditorV4 : null;
  const vm = useContentViewModel<LinkViewModel>(model as TextFileModel, "link-view");
  const source: LinkSource | null = linkEditor ?? vm;
  ```
- Delete duck-typed block (lines 37-52).
- Delete `updatePanels` useEffect (lines 57-71).
- Replace prop passing: `<LinkCategoryPanel vm={source} useOpenRawLink={!isMainEditor} categoriesOnly={isMainEditor} pageId={…} />`.

Actually simpler: the secondary-editor's `model` is the page's `mainEditor`. When LinkEditor is main, `model.id === mainEditorId`. When LinkEditor is standalone-secondary, the page's `mainEditor` is a different editor (Monaco). So:
- Pass `model: V4EditorModel` always (already SecondaryEditorProps).
- The wrapper checks `model instanceof LinkEditor`:
  - true → render directly (no acquireViewModel; v4 LinkEditor IS the source).
  - false → legacy-embed path (BrowserEditor case) — acquireViewModel("link-view") on the TextFileModel.

Concrete:
```typescript
export default function LinkCategorySecondaryEditor({ model, headerRef }: SecondaryEditorProps) {
    const linkEditor = model instanceof LinkEditor ? model : null;
    // Legacy fallback for browser-embed / acquireViewModel paths:
    const vm = useContentViewModel<LinkViewModel>(linkEditor ? null : (model as TextFileModel), "link-view");
    const source: LinkSource | null = linkEditor ?? vm;
    // ... rest of wrapper using `source` everywhere `vm` was used
}
```

Wait — `useContentViewModel` doesn't handle null model gracefully today. Need to keep BOTH paths separate or add a null guard. Simpler: split into two branches; one renders the LinkEditor path, one renders the legacy LinkViewModel path. OR: always acquireViewModel (no-op for v4 LinkEditor case) — but then the legacy host's content lives in TWO sources (legacy LinkViewModel and v4 LinkEditor). NO — we want one source per render path.

Cleanest: branch at the top.
```typescript
export default function LinkCategorySecondaryEditor({ model, headerRef }: SecondaryEditorProps) {
    if (model instanceof LinkEditor) {
        return <LinkCategoryV4Wrapper model={model} headerRef={headerRef} />;
    }
    return <LinkCategoryLegacyWrapper model={model as TextFileModel} headerRef={headerRef} />;
}
```
Two component functions; V4 wrapper uses `model.treeProvider` + `model.selectionState` + `model.selectByHref` + `model.state.use(...)` natively; legacy wrapper does today's `useContentViewModel` + duck-typing dance.

Actually since the v4 LinkEditor lifecycle hooks (LK7 + LK8) already reshape the panel list model-side, the v4 wrapper's `updatePanels` useEffect (which today watches `vm.state.tags.length`) is unnecessary. And the v4 LinkEditor already exposes `treeProvider` / `selectByHref` / `selectionState` natively — the v4 wrapper doesn't need to inject them.

So the v4 wrapper is MUCH simpler than today's wrapper. Mostly just renders the header (Save + Swap buttons) + LinkCategoryPanel.

#### `panels/LinkTagsSecondaryEditor.tsx`

Same split: detect `model instanceof LinkEditor` → render `<LinkTagsPanel vm={model} />` (main mode) or `<LinkTagsNavigationPanel vm={model} pageId={…} />` (secondary mode). Legacy path keeps the existing useContentViewModel acquisition.

#### `panels/LinkHostnamesSecondaryEditor.tsx`

Same split: simpler — just renders `<LinkHostnamesPanel vm={source} />`.

### Phase 9 — Update legacy registry (LK15)

Edit `src/renderer/editors/register-editors.ts`:

1. Remove `"link-view"` from `TEXT_CONTENT_VIEW_BRIDGE_IDS` (line 761):
   ```typescript
   const TEXT_CONTENT_VIEW_BRIDGE_IDS = new Set([
       // ...
       // link-view removed — US-555 ships native v4 module.
       "notebook-view",
       "todo-view",
       "rest-client",
   ]);
   ```

2. Add native v4 register call at the bottom of the file (mirror of draw-view block at lines 1062-1088):
   ```typescript
   // US-555 — replace the legacy bare-adapter mirror for link-view with a
   // native v4 module. `v4EditorRegistry.register` overwrites by id, so this
   // supersedes the bare-adapter stub the mirror loop wrote. `accepts` delegates
   // to the legacy registry def's `acceptFile` / `switchOption` / `isEditorContent`
   // to avoid duplicating extension/language/content-peek rules.
   v4EditorRegistry.register({
       id: "link-view",
       name: "Links",
       hasContentHost: true,
       accepts: (input) => {
           const legacy = editorRegistry.getById("link-view");
           if (!legacy) return -1;
           if (input.fileName) {
               const p = legacy.acceptFile?.(input.fileName) ?? -1;
               if (p >= 0) return p;
           }
           if (input.language) {
               const p = legacy.switchOption?.(input.language, input.fileName) ?? -1;
               if (p >= 0) return p;
           }
           // Content-peek fallback (LK10): for JSON files with link-editor shape.
           if (input.language === "json" && input.host) {
               const content = (input.host.state.get() as { content?: string }).content ?? "";
               if (legacy.isEditorContent?.(input.language, content)) return 60;
           }
           return -1;
       },
       loadModule: async () => {
           const { linkModule } = await import("./link-editor");
           return linkModule;
       },
   });
   ```

The legacy `editorRegistry.register({ id: "link-view", … })` at line 458 STAYS ALIVE for notebook-embed + browser-embed (mirror of how `graph-view` / `draw-view` legacy registrations persist).

### Phase 10 — Update `page.asLink` facade (LK16)

#### `src/renderer/scripting/api-wrapper/LinkEditorFacade.ts`

Constructor accepts `LinkEditor`; method bodies preserved (`this.vm.X` → `this.editor.X` one-symbol rename):

```typescript
import type { LinkEditor } from "../../editors/link-editor";
import type { LinkItem } from "../../editors/link-editor/linkTypes";

export class LinkEditorFacade {
    constructor(private readonly editor: LinkEditor) {}

    get links() { return this.editor.state.get().data.links.map((link) => mapLink(link, this.editor)); }
    get categories() { return this.editor.state.get().categories; }
    get tags() { return this.editor.state.get().tags; }
    get linksCount() { return this.editor.state.get().data.links.length; }

    addLink(url: string, title?: string, category?: string): void {
        this.editor.addLink({ href: url, title: title ?? "", category: category ?? "" });
    }
    deleteLink(id: string): void { this.editor.deleteLink(id, true); }
    updateLink(id: string, data: { title?: string; category?: string; url?: string }): void {
        const updates: Partial<Omit<LinkItem, "id">> = {};
        if (data.title !== undefined) updates.title = data.title;
        if (data.category !== undefined) updates.category = data.category;
        if (data.url !== undefined) updates.href = data.url;
        this.editor.updateLink(id, updates);
    }
}

function mapLink(link: LinkItem, editor: LinkEditor) {
    return {
        id: link.id, url: link.href, title: link.title,
        category: link.category, tags: link.tags,
        pinned: editor.isLinkPinned(link.id),
        isDirectory: link.isDirectory ?? false,
    };
}
```

#### `src/renderer/scripting/api-wrapper/PageWrapper.ts`

Replace `import type { LinkViewModel }` with `import { LinkEditor } from "../../editors/link-editor";`. Rewrite `asLink`:

```typescript
async asLink(force = false): Promise<LinkEditorFacade> {
    await this.ensureEditor("link-view", "Link", "asLink", force);
    const v4 = this.v4;
    if (!(v4 instanceof LinkEditor)) {
        throw new Error("asLink(): page is not a LinkEditor after switch");
    }
    return new LinkEditorFacade(v4);
}
```

Drop the `acquireViewModel("link-view")` + `releaseList.push(() => model.releaseViewModel("link-view"))` lines.

### Phase 11 — Verify tsc + eslint

```bash
npm run lint
```

Zero NEW errors on touched files. Pre-existing warnings (e.g., LinkView.tsx's eslint warnings inherited from today's LinkEditor.tsx) tolerated identically to Graph/Draw.

### Phase 12 — Manual acceptance tests

See Acceptance Criteria below — 14 manual tests.

---

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `src/renderer/editors/link-editor/LinkEditor.tsx` | RENAME → `LinkView.tsx` | LK11 — preserved for browser-embed + notebook-embed; exported function name `LinkEditor` unchanged |
| `src/renderer/editors/link-editor/LinkEditor.ts` | NEW | v4 class (~400 LOC); ILinkSource impl; CONTENT_HOST_TRAIT; HS1 host slot; LK6/LK7/LK8 lifecycle hooks; verbatim relocation of LinkViewModel methods |
| `src/renderer/editors/link-editor/LinkBody.tsx` | NEW | v4 body (~250 LOC); `editor.state.use(...)` selector reads; no portals; LK6 view dispatcher |
| `src/renderer/editors/link-editor/index.tsx` | NEW | Module wrapper (~150 LOC); TextChrome + toolbar bits + footer bits |
| `src/renderer/editors/link-editor/LinkViewModel.ts` | PRESERVE | Used by browser-embed (BrowserBookmarks) + future notebook-embed (US-557 retrospective) |
| `src/renderer/editors/link-editor/linkTypes.ts` | MODIFY | Add `ILinkSource` interface + `LinkSource` union type alias |
| `src/renderer/editors/link-editor/LinkTreeProvider.ts` | MODIFY | Constructor takes `ILinkSource` instead of `LinkViewModel`; method bodies `this.vm.X` → `this.source.X` |
| `src/renderer/editors/link-editor/linkTraits.ts` | unchanged | Trait registration verbatim |
| `src/renderer/editors/link-editor/LinksList.tsx` | MODIFY | `model` prop type → `LinkSource` |
| `src/renderer/editors/link-editor/LinksTiles.tsx` | MODIFY | `model` prop type → `LinkSource` |
| `src/renderer/editors/link-editor/LinkItemList.tsx` | MODIFY | `model` prop type → `LinkSource` |
| `src/renderer/editors/link-editor/LinkItemTiles.tsx` | MODIFY | `model` prop type → `LinkSource` |
| `src/renderer/editors/link-editor/PinnedLinksPanel.tsx` | MODIFY | `model` prop type → `LinkSource` |
| `src/renderer/editors/link-editor/EditLinkDialog.tsx` | unchanged | Stateless dialog data passing |
| `src/renderer/editors/link-editor/LinkTooltip.tsx` | unchanged | Read-only component |
| `src/renderer/editors/link-editor/panels/LinkCategoryPanel.tsx` | MODIFY | `vm` prop type → `LinkSource`; method calls preserved verbatim |
| `src/renderer/editors/link-editor/panels/LinkTagsPanel.tsx` | MODIFY | `vm` prop type → `LinkSource`; method calls preserved verbatim |
| `src/renderer/editors/link-editor/panels/LinkHostnamesPanel.tsx` | MODIFY | `vm` prop type → `LinkSource`; method calls preserved verbatim |
| `src/renderer/editors/link-editor/panels/LinkCategorySecondaryEditor.tsx` | MODIFY | Branch on `model instanceof LinkEditor`; v4 wrapper drops duck-typed block + updatePanels useEffect; legacy wrapper preserved |
| `src/renderer/editors/link-editor/panels/LinkTagsSecondaryEditor.tsx` | MODIFY | Branch on `model instanceof LinkEditor`; v4 path uses model directly; legacy path preserved |
| `src/renderer/editors/link-editor/panels/LinkHostnamesSecondaryEditor.tsx` | MODIFY | Branch on `model instanceof LinkEditor`; legacy path preserved |
| `src/renderer/editors/browser/BrowserEditorView.tsx` | MODIFY | Import path `../link-editor/LinkEditor` → `../link-editor/LinkView` |
| `src/renderer/editors/browser/BookmarksDrawer.tsx` | MODIFY | Import path `../link-editor/LinkEditor` → `../link-editor/LinkView` |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | MODIFY | Import `{LinkEditor, defaultLinkEditorState}`; add `link-view` branch in `wrapLegacyForPage` after draw-view branch |
| `src/renderer/editors/register-editors.ts` | MODIFY | Update legacy `loadModule` import path (LinkEditor → LinkView); remove `link-view` from `TEXT_CONTENT_VIEW_BRIDGE_IDS`; add v4 register call at bottom |
| `src/renderer/scripting/api-wrapper/LinkEditorFacade.ts` | REWRITE | Constructor takes `LinkEditor` (was `LinkViewModel`); method bodies one-symbol rename |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | MODIFY | `asLink` flips from acquireViewModel to v4 instanceof check |

**Files that need NO changes** (so don't waste investigation time):
- `src/renderer/editors/browser/BrowserBookmarks.ts` — legacy `acquireViewModel("link-view")` path stays alive for embed.
- `src/renderer/editors/category/CategoryEditor.tsx` — `findTreeProviderHost` duck-typed reads work as-is (TS `in` operator passes against the v4 LinkEditor's getter).
- `src/renderer/api/pages/PagesLifecycleModel.ts:194/270-307` — duck-typed `(editor as any).treeProvider` reads work as-is.
- `src/renderer/editors/base/v4/editorRegistry.ts` — title-fallback shipped in US-565.
- `src/renderer/api/types/link-editor.d.ts` — facade contract unchanged.
- `src/renderer/editors/link-editor/EditLinkDialog.tsx`, `LinkTooltip.tsx`, `linkTraits.ts` — stateless or trait registration.

---

## Acceptance criteria

1. **Open existing `.link.json` file** — opens in native v4 LinkEditor with all links, categories, tags, hostnames visible. Center grid renders.
2. **Create new empty Link page** — sidebar "New Link Page" button creates `untitled.link.json` page. Editor switch widget shows "Text Editor" + "Links" buttons (title-fallback in registry works).
3. **Add / edit / delete links** — Add Link button + Edit dialog + Delete with confirmation work. JSON content auto-saves to host (verify via Switch to Text Editor — content reflects changes).
4. **Drag-and-drop link import** — drag LINK trait payload onto center grid → links imported. Folder scan with 100-file limit confirmation works.
5. **Sidebar panels (in-editor mode)** — close NavPanel; Categories + Tags + Hostnames panels appear INSIDE LinkEditor body. Click category → filters center grid.
6. **Sidebar panels (sidebar-open mode)** — open NavPanel; Categories + Tags + Hostnames panels appear IN sidebar. In-editor panels disappear from body. Click category in sidebar → filters body grid.
7. **Demote to standalone-secondary (LK7 + LK8)** — open `.link.json` (Link is main); open NavPanel (panels in sidebar). Navigate to a different file via Explorer → main editor swaps to Monaco/Markdown/etc.; Link panels REMAIN in sidebar; Hostnames panel HIDDEN; Categories + Tags (if tags exist) STAY.
8. **Swap demoted Link back to main** — click Swap button on standalone Categories panel header → LinkEditor becomes main; all 3 panels (Cat/Tags/Hostnames) restored.
9. **Selection-state HS1 persistence** — set expandedPanel="tags", selectedTag="lang:typescript"; switch to Monaco; switch back to Link → state restored. Restart app → state restored across restart.
10. **CategoryEditor tree-provider integration (LK9)** — open a `tree-category://` link that points into a `.link.json` collection; CategoryEditor's TreeProviderView renders link items. Click into a link → opens via openRawLink pipeline.
11. **Script API `page.asLink()`** — run script that calls `await page.asLink(); …addLink(…)…` on an active Link page. Link added; UI re-renders.
12. **Browser BlankPage embed** — open Browser page; new tab (about:blank) — BlankPageLinks renders the LinkEditor using legacy LinkViewModel. Add Link from BlankPage → bookmarks file updated; same data visible in BookmarksDrawer.
13. **Browser BookmarksDrawer embed** — open Browser; click Bookmarks → drawer opens with LinkEditor. Add / edit / delete bookmark works.
14. **JSON self-write loop quiet** — open Link page; idle for 5 seconds. No console errors; no infinite content↔state loop; modified flag accurate.

---

## Notes

- **Sibling reference:** Mirror of Graph (US-564) and Draw (US-565) — both ship `*Editor.ts` + `*Body.tsx` + `index.tsx` with HS1 host slot, self-write guard, and preserved legacy `*View.tsx` + `*ViewModel.ts`. The Link migration adds the FIRST set of secondary-editor sidebar lifecycle hooks (`beforeNavigateAway` + `onMainEditorChanged`).
- **Two new lifecycle hooks exercised:** `beforeNavigateAway` (LK7) and `onMainEditorChanged` (LK8) — present in the mockup since walkthrough 03 for exactly this purpose. First text-bearing editor uses them. Second + third exercises land in US-556 (Todo) and US-563 (Rest Client).
- **NoteItemEditModel / acquireViewModel survival:** The `acquireViewModel` machinery stays alive — `BrowserBookmarks` consumes it, and `NoteItemEditModel` consumes it for notebook per-note dispatch. Full retirement in US-557 / US-559.
- **Three duck-typed `(m as any)` casts retire** — all three (`m.treeProvider`, `m.selectionState`, `m.selectByHref`) become typed members on v4 LinkEditor. The CONSUMER-side duck-typed reads stay (TS `in` operator passes against real getters).
- **`<host.id>:link-editor` cache file orphans linger harmlessly** per P9 — no migration shim.
- **The v4 LinkEditor file `LinkEditor.ts` and the preserved legacy view `LinkView.tsx` live side-by-side** in `link-editor/`. The folder structure matches the GraphView/GraphEditor and DrawView/DrawEditor sibling pairs.
- **Risk envelope:** Largest of the Tier-5 migrations so far. 19 files in the folder. Two live embed sites. The sidebar lifecycle hooks have no prior exercise. Investigation flagged six retrospective concerns (LK11–LK16) which are now resolved in the plan.
