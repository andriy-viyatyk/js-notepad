# Secondary Editor System

How sidebar panels work in Persephone. Covers registration, lifecycle hooks, navigation survival, rendering, persistence, and how to add new secondary views.

**Source code:** [`PageModel.ts`](../../src/renderer/api/pages/PageModel.ts), [`EditorModel.ts`](../../src/renderer/editors/base/EditorModel.ts), [`SecondaryViews.tsx`](../../src/renderer/ui/secondary-views/SecondaryViews.tsx)

---

## Overview

PageModel holds a `secondaryViews[]` array of EditorModel instances that appear as sidebar panels in SecondaryViews. Secondary views can be separate models (like ExplorerEditorModel) or the mainEditor itself (like ArchiveEditorModel when browsing an archive).

```
PageModel (one per tab)
  ├── mainEditor: EditorModel              // primary content area
  ├── secondaryViews: EditorModel[]      // sidebar panels
  │   ├── ExplorerEditorModel              // Pattern A: separate model
  │   └── ArchiveEditorModel ←── same as mainEditor  // Pattern B: mainEditor as secondary
  ├── secondaryViewsModel                   // sidebar layout: open/close/width
  ├── activePanel: string                  // which panel is expanded
  └── expandPanel(panelId)                 // expand a specific panel
```

---

## 1. Core Mechanism — the `secondaryView` setter

The `secondaryView` getter/setter on EditorModel manages `PageModel.secondaryViews[]` membership automatically. It is `string[] | undefined` — one model can register multiple sidebar panels:

```typescript
// Setting adds the model to page.secondaryViews[]
model.secondaryView = ["archive-tree"];       // one panel
model.secondaryView = ["explorer", "search"]; // multiple panels

// Clearing removes the model (without disposing it)
model.secondaryView = undefined;
```

**Internally**, the setter calls `this.page?.addSecondaryView(this)` or `this.page?.removeSecondaryViewWithoutDispose(this)`. This is the ONLY way models should register/unregister themselves.

---

## 2. Two Registration Patterns

### Pattern A: Separate model (ExplorerEditorModel)

A dedicated EditorModel subclass that is ONLY a secondary view — never becomes mainEditor.

```
PageModel
  ├── mainEditor: TextFileModel
  └── secondaryViews: [ExplorerEditorModel]  // separate instance
```

- Created by `PageModel.createExplorer(rootPath)` or during restore
- Survives navigation — `beforeNavigateAway()` never clears (Explorer is always present)
- Disposed when user closes the panel or the page closes

### Pattern B: mainEditor as secondary (ArchiveEditorModel)

The mainEditor registers itself in `secondaryViews[]` simultaneously. The same model instance is both `page.mainEditor` and in `page.secondaryViews[]`.

```
PageModel
  ├── mainEditor: ArchiveEditorModel ←─── same instance
  └── secondaryViews: [ExplorerEditorModel, ArchiveEditorModel ←─── same instance]
```

- ArchiveEditorModel sets `this.secondaryView = ["archive-tree"]` in `restore()` or `setPage()`
- When user navigates to a file inside the archive, ArchiveEditorModel becomes a secondary view:
  - `beforeNavigateAway(newEditor)` checks `newEditor.sourceLink?.sourceId === this.id`
  - If the new file was opened from this archive → keeps `secondaryView` → **survives as secondary**
  - `setMainEditor()` checks `survivesAsSecondary = secondaryViews.includes(oldEditor)` — if true, old editor is NOT disposed
- When user navigates to an unrelated file → `beforeNavigateAway()` clears `secondaryView` → removed from sidebar → disposed

**This pattern is designed into PageModel** — `setMainEditor()` explicitly handles it.

---

## 3. Lifecycle Hooks

EditorModel provides lifecycle hooks that PageModel calls at specific moments:

| Hook | Called by | When | Base behavior | Override for |
|------|-----------|------|---------------|-------------|
| `setPage(page)` | `addSecondaryView()`, `setMainEditor()` | Model attached to / detached from a page | Stores reference | Registration (e.g., ArchiveEditorModel sets `secondaryView` here) |
| `beforeNavigateAway(newEditor)` | `setMainEditor()` | Old mainEditor is about to be replaced | Clears `secondaryView` (remove self) | Conditional survival (check `newEditor.sourceLink`) |
| `onMainEditorChanged(newMainEditor)` | `notifyMainEditorChanged()` | After mainEditor was replaced | No-op | React to new content: highlight file in tree, clear selection, or remove self |
| `onPanelExpanded(panelId)` | `setActivePanel()` | A panel belonging to this model was expanded | No-op | Deferred reveal (scroll to highlighted item) |

---

## 4. Navigation Flow

When user navigates to a new file (`navigatePageTo()`):

```
1. page.setMainEditor(newEditor)
   ├── oldEditor.beforeNavigateAway(newEditor)
   │   ├── Base: this.secondaryView = undefined  → removed from sidebar
   │   └── Override (ArchiveEditorModel): keep if newEditor is from this archive
   │
   ├── survivesAsSecondary = secondaryViews.includes(oldEditor)
   │   ├── true  → oldEditor stays alive (no dispose, no setPage(null))
   │   └── false → oldEditor.setPage(null), deferred dispose
   │
   ├── this._mainEditor = newEditor
   ├── newEditor.setPage(this)
   │
   ├── notifyMainEditorChanged()
   │   ├── For each secondary view: m.onMainEditorChanged(newMainEditor)
   │   │   └── ArchiveEditorModel: checks sourceId, clears if unrelated → dispose
   │   │   └── ExplorerEditorModel: updates highlight, never clears
   │   └── Cleanup: remove & dispose models that cleared their secondaryView
   │
   └── Register new editor's secondary panel if newEditor.secondaryView is set
```

---

## 4b. Promote / Demote Flow

A secondary view can be toggled into the main editor role (and back) via `promoteSecondaryToMain(model)`:

**Promote** (secondary → main):
```
1. page.promoteSecondaryToMain(model)  // model is in secondaryViews[], not mainEditor
   └── page.setMainEditor(model)       // standard navigation lifecycle
       ├── oldEditor.beforeNavigateAway(model)
       │   └── base: this.secondaryView = undefined → removed from sidebar → disposed
       ├── model becomes mainEditor AND stays in secondaryViews[] (Pattern B)
       ├── notifyMainEditorChanged()
       └── pagesModel.resubscribeEditor(page)
```

**Demote** (main → secondary-only):
```
1. page.promoteSecondaryToMain(model)  // model IS mainEditor
   ├── this._mainEditor = null         // clear without dispose (model stays as secondary)
   ├── state.mainEditorId = null       // UI re-renders: content area becomes empty
   ├── notifyMainEditorChanged()       // secondaries notified with null
   ├── queueMicrotask: restore panels if promoted-from-secondary
   │   ├── If _prePromotePanels saved → restore pre-promote panel list
   │   └── If no saved panels (was originally main, Pattern B) → leave panels as-is
   │       (secondary view component manages its own panel list via useEffect)
   └── pagesModel.resubscribeEditor(page)
```

The demote path does NOT call `setMainEditor(null)` — that would dispose the model. Instead it directly clears the reference, keeping the model alive in `secondaryViews[]`.

**Panel save/restore:** When promoting, the current panel list is saved as `_prePromotePanels`. On demote, if saved panels exist (model was promoted from secondary), they are restored. For Pattern B (model was originally the main editor, no saved panels), panels are left unchanged — the secondary view component (e.g., `LinkCategorySecondaryView`) manages the panel list reactively via `useEffect`. The `queueMicrotask` ensures this runs after React unmount cleanup.

---

## 5. Panel Management

**Active panel:** `PageModel.activePanel` tracks which panel is expanded. Only one panel is expanded at a time. Its value is a **composite panel key** `` `${editorId}::${panelId}` `` (see §5a) — e.g. `"a1b2…::archive-tree"`. Use `PageModel.activePanelId` to read the **bare** panel-type id (`"archive-tree"`) for "is panel X expanded" checks.

**Expand:** `page.expandPanel(panelId)` — accepts a **bare** panel-type id (resolved to the owning editor's composite key) or an already-composite key (passed through). Sets activePanel and calls `onPanelExpanded(panelId)` (bare) on the owning model. Used by models to auto-expand their panel (e.g., ArchiveEditorModel expands "archive-tree" when navigating to an archive entry).

**Close — two semantics:**
- **Hide the panel only** (default): the close handler clears `model.secondaryView = undefined`, removing the model from the sidebar (without disposing). The standard pattern for user-closeable panels.
- **Remove the whole Pattern B editor** (`page.removeSecondaryView(model)`): detaches *and disposes* the model. Because `detach()` clears `mainEditorId` when the editor was also the main, this leaves the page empty if the editor was main, and leaves a different main untouched otherwise. Used by `ArchiveSecondaryView` and by `GitTreeEditorModel.requestClose()` (the Git Tree "x" — US-617). The Git Tree "x" is intentionally **unconditional** (unlike `ArchiveSecondaryView`, which hides its "x" while it is the main), because the empty-page outcome is the intended behavior.

---

## 5a. Composite Panel Keys (US-619)

**Source:** [`panel-key.ts`](../../src/renderer/ui/secondary-views/panel-key.ts)

A panel id (`"git-changes"`, `"archive-tree"`) names a panel **type** — the registry key. It is **not** unique within a page: two models can contribute the same type. The canonical case is two open git repositories, each contributing a `"git-changes"` panel. The sidebar must render **all** of them — uniqueness restriction does not belong in the render layer.

A *rendered* panel's identity is therefore the **composite** of its owning editor id and its panel-type id:

```
panelKey(editorId, panelId) → `${editorId}::${panelId}`
```

Editor ids are UUIDs and panel-type ids are kebab-case, so `"::"` is an unambiguous separator. `panel-key.ts` exposes `panelKey()`, `parsePanelKey()` (a bare id with no separator parses to `{ editorId: "", panelId }`), `panelIdOf()`, and `isCompositePanelKey()`.

**Bare vs. composite — the split:**

| Surface | Form | Why |
|---------|------|-----|
| `model.secondaryView = [...]` (declaration) | **bare** (`"git-changes"`) | Models declare the panel *type*. They never mint instance ids — uniqueness is the sidebar's job. |
| Registry lookup (`secondaryViewRegistry.get`) | **bare** | One registered component serves every instance of a type. |
| `activePanel` storage + `CollapsiblePanel id` | **composite** | The accordion needs a unique identity per *rendered* panel to track which one is expanded. |
| `expandPanel(id)` | **either** | A bare id resolves to the owning editor's composite; a composite is passed through. |
| `onPanelExpanded(panelId)` + the `panelExpanded` event | **bare** | Editors/subscribers reason about panel *type*, not instances. `setSecondaryViewsState` extracts the bare id from the composite before notifying. |
| `activePanelId` getter | **bare** | Convenience for "is panel X expanded" checks (Explorer/Archive use `this.page?.activePanelId === "explorer"`). |

**Seed/legacy resolution:** the default `activePanel` seed (`"explorer"`) and any pre-US-619 persisted bare value are resolved to their composite at render time in `SecondaryViews` (a bare value is matched against the rendered panels' bare ids). After any accordion click, `activePanel` is already composite.

**Same-type dedup is a model-level concern, not a render-level one.** Re-clicking the *same* repo's `.git` reuses the existing `GitTreeEditorModel` via `matchesNavigationTarget` (see [pages-architecture.md §9](pages-architecture.md)), so no duplicate model is created. Different repos correctly produce distinct models, and the sidebar renders a `"git-changes"` panel for each. `CollapsiblePanelStack` (UIKit) is untouched — it operates on whatever id string it is given, so feeding it composite keys needs no change.

---

## 6. Rendering in SecondaryViews

**Source:** [`SecondaryViews.tsx`](../../src/renderer/ui/secondary-views/SecondaryViews.tsx)

The rendering loop nests: outer loop over models (`flatMap`), inner loop over each model's `secondaryView[]` panel IDs. Every `(model, panelId)` pair is rendered — there is **no** panel-id-uniqueness restriction (the old `seenPanelIds` dedup was removed in US-619). The `CollapsiblePanel` `id` is the **composite** key (§5a); the registry lookup and the `LazySecondaryView panelId` prop stay **bare**:

```tsx
secondaryViews.flatMap((model) => {
    const panelIds = model.secondaryView ?? [];
    return panelIds
        .filter((panelId) => secondaryViewRegistry.has(panelId))
        .map((panelId) => (
            <CollapsiblePanel key={`${model.id}-${panelId}`} id={panelKey(model.id, panelId)}
                headerRef={setHeaderRef} alwaysRenderContent>
                <LazySecondaryView model={model} panelId={panelId} headerRef={...} />
            </CollapsiblePanel>
        ));
})
```

The React `key` stays the `${model.id}-${panelId}` ref-key; the accordion identity is the composite `id`. `activePanel` (composite) is passed to `CollapsiblePanelStack` after the bare-seed resolution described in §5a.

**Portal-based headers:** `CollapsiblePanel` accepts a `headerRef` callback that exposes the header `<div>`. The loaded secondary view component uses `createPortal(headerContent, headerRef)` to render its title, buttons, and icons into the header. This lets each secondary view fully control its header content.

**`alwaysRenderContent`:** Keeps panel content mounted when collapsed (`display: none`). Required for portal components to render headers even when their panel is collapsed.

**Reactivity:** `secondaryViews` is a plain array (EditorModel instances can't be in TOneState — Immer proxies would corrupt them). A `secondaryViewsVersion` counter (`TOneState<{ version }>`) is bumped on every add/remove. SecondaryViews subscribes via `.use()`.

**Registry:** [`secondary-view-registry.ts`](../../src/renderer/ui/secondary-views/secondary-view-registry.ts) maps panel ID strings to React sidebar components via dynamic imports. Each registration provides an `id`, `label`, and `loadComponent()` factory.

---

## 7. Persistence

Secondary view state is saved as `SecondaryModelDescriptor[]` in the PageModel sidebar cache (`_saveState()`). Each descriptor contains the model's serialized `IEditorState` from `getRestoreData()`.

On restore:
1. `restoreSidebar()` reads cache, stores descriptors as `pendingSecondaryDescriptors`
2. `restoreSecondaryViews(ownerEditor)` processes them after the mainEditor is created. The `ownerEditor` parameter is nullable — pass `null` for pages without mainEditor (Pattern A standalone secondary views).
3. **Deduplication:** If `ownerEditor` is non-null and a descriptor's ID matches `ownerEditor.id`, the existing ownerEditor instance is reused (added to `secondaryViews[]` directly, no new model created). This handles Pattern B — when mainEditor was also a secondary view before restart.

---

## 8. Dispose

When a tab closes:
1. `page.close()` → `confirmSecondaryRelease()` checks secondary views for unsaved changes
2. `page.close()` → `mainEditor.confirmRelease()` checks main editor
3. `page.dispose()` → iterates `secondaryViews[]`, calls `dispose()` on each, then disposes mainEditor
4. `page.dispose()` → `fs.deleteCacheFiles(this.id)` deletes page-level cache files (e.g., `{pageId}_nav-panel.txt`). Editor-level cache files are deleted by each `EditorModel.dispose()` call.

For Pattern B (mainEditor in secondaryViews[]), the model may be disposed twice by `dispose()`. This is safe — `EditorModel.dispose()` is idempotent (`pipe` is nulled on first call, cache file deletion is a no-op on second call).

---

## 9. PageModel Management API

| Method | Description |
|--------|-------------|
| `addSecondaryView(model)` | Adds model to array, calls `model.setPage(this)`, bumps version. If model is already registered, still bumps version (panel list may have changed). |
| `removeSecondaryView(model)` | Removes, disposes, falls back `activePanel` if needed |
| `removeSecondaryViewWithoutDispose(model)` | Removes without disposing (used by `secondaryView` setter). Skips `setPage(null)` if model is the mainEditor (Pattern B guard). |
| `promoteSecondaryToMain(model)` | Toggle: if model is secondary-only → promotes to mainEditor (old main goes through `setMainEditor` lifecycle); if model IS mainEditor → demotes (clears mainEditor to null, model stays as secondary). Calls `resubscribeEditor` for persistence. |
| `findSecondaryView(editorId)` | Lookup by editor model ID |
| `confirmSecondaryRelease()` | Iterates modified secondaries, prompts user via `confirmRelease()` |
| `restoreSecondaryViews(ownerEditor)` | Restores from `pendingSecondaryDescriptors`, deduplicates against owner |
| `notifyMainEditorChanged()` | Propagates main editor change, cleans up models that cleared themselves |
| `setActivePanel(panel)` | Sets expanded panel (composite key), notifies owning model via `onPanelExpanded()` (bare id) |
| `expandPanel(panelId)` | Expands a panel. Accepts a **bare** panel-type id (resolved to the owning editor's composite key) or an already-composite key. See §5a. |
| `activePanel` / `activePanelId` | `activePanel` = composite key of the expanded panel; `activePanelId` = its **bare** panel-type id (for "is panel X expanded" checks). See §5a. |
| `findExplorer()` | Returns the ExplorerEditorModel from secondaryViews (if any) |
| `createExplorer(rootPath)` | Creates ExplorerEditorModel, adds to secondaryViews |
| `getTransient<T>(key)` | Read a transient (non-persisted) runtime value by key. Returns undefined if not set. |
| `setTransient(key, value)` | Write a transient runtime value. Pass undefined to delete. Cleared on page close / app restart. |

---

## 10. Existing Secondary Editors

| Model | Panel IDs | Pattern | Survival | Created by |
|-------|-----------|---------|----------|-----------|
| `ExplorerEditorModel` | `["explorer"]` or `["explorer", "search"]` | A (separate) | Always survives navigation | `PageModel.createExplorer()` or restore |
| `ArchiveEditorModel` | `["archive-tree"]` | B (mainEditor) | Survives if new editor was opened from this archive | `_openArchive()` in PagesLifecycleModel |
| `LinkEditor` (links, main) | `["link-category", "link-tags", "link-hostnames"]` (always all 3) | B (mainEditor) | Removed on navigation (default `beforeNavigateAway`). Removed when SecondaryViews closes, re-registered when it opens. First open fires `secondaryViewsToggled` via `PageModel.toggleNavigator()`. | LinkEditor component `useEffect` (subscribes to `secondaryViewsToggled` event) |
| `LinkEditor` (links, standalone) | `["link-category", "link-tags"?]` (dynamic) | A (separate) | Always survives (base `onMainEditorChanged` is no-op). Exposes `treeProvider`/`selectionState`/`selectByHref()` via duck-typing for CategoryEditor discovery and player track navigation. "link-tags" dynamically registered when tags exist. | LinkCategorySecondaryView useEffect (subscribes to model state for tag changes) |
| `NotebookEditor` | `["notebook-categories", "notebook-tags"?]` | B (mainEditor) | Removed on navigation (default `beforeNavigateAway`). Removed when SecondaryViews closes, re-registered when it opens. "notebook-tags" only when tags exist. | NotebookBody `useEffect` (subscribes to `secondaryViewsToggled` event) |
| `TodoEditor` | `["todo"]` | B (mainEditor) | Removed on navigation (default `beforeNavigateAway`). Removed when SecondaryViews closes, re-registered when it opens. | TodoBody `useEffect` (subscribes to `secondaryViewsToggled` event) |
| `RestClientEditor` | `["rest"]` | B (mainEditor) | Removed on navigation (default `beforeNavigateAway`). Removed when SecondaryViews closes, re-registered when it opens. | RestClientBody `useEffect` (subscribes to `secondaryViewsToggled` event) |
| `LinkEditor` (browser bookmarks) | `["link-category", "link-tags", "link-hostnames"]` | B — hosted on `BrowserPanelHost` (not `PageModel`) | Always present while the browser page is open; sidebar is mandatory-open. | `BrowserPanelHost.attach()` — called by `BrowserEditorModel` during bookmarks init |
| `GitTreeEditorModel` | `["git-changes"]` | B (mainEditor) | **Unconditional survival** — `beforeNavigateAway()` is a no-op, so the "Changes" panel stays when clicking a changed file opens its Git Diff (the editor becomes secondary-only). The only removal path is the panel's manual "x" → `requestClose()` → `page.removeSecondaryView(this)` (US-617). Also a **per-page navigation-singleton** (`matchesNavigationTarget` / `onNavigationReuse`): re-navigating to the same repo reuses this instance instead of stacking duplicates — see [pages-architecture.md §9 "navigation-singleton reuse"](pages-architecture.md). **Multiple repos coexist:** opening a second repo's `.git` creates a second instance, so the page shows one `"git-changes"` panel per repo (distinct composite keys, §5a); the header reads `[<repoName>] Changes` (`model.repoName`) to disambiguate (US-619). | `setPage()` sets `secondaryView = ["git-changes"]` on attach (EPIC-031 / US-616) |
| `FileDiffEditor` | `["git-diff-revisions"]` (label "File History") | B (mainEditor) | **Removed on navigation AND editor-switch** — uses the **default** `beforeNavigateAway` (clears `secondaryView`), so the "File History" panel disappears when the page navigates to another file or when the Git Diff is switched back to the Text Editor. The deliberate **opposite** of `GitTreeEditorModel`'s unconditional survival (the panel is meaningful only while its Git Diff is the main editor). The panel shows the file's filtered commit history with synthetic Unstaged/Staged rows + per-row L/R (from/to) side-select toggles bound to the editor's single `from`/`to` state. | `adoptHost()` sets `secondaryView = ["git-diff-revisions"]` (mirrors `TodoEditor`; EPIC-031 / US-618) |

---

## 11. Adding a New Secondary Editor

### Step 1: Create the EditorModel subclass (or use an existing mainEditor model)

**For Pattern A** (separate model):
```typescript
class MySecondaryModel extends EditorModel<MyState> {
    // Set secondaryView when ready
    setPage(page: PageModel | null): void {
        super.setPage(page);
        if (page && this.isReady) {
            this.secondaryView = ["my-panel"];
        }
    }
    
    // Decide survival on navigation
    beforeNavigateAway(newEditor: EditorModel): void {
        if (this.shouldSurvive(newEditor)) return; // keep secondaryView set
        this.secondaryView = undefined; // clear → removed from sidebar
    }
    
    // React to main editor changes
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (!newMainEditor || newMainEditor === this) return;
        // Update highlights, or clear secondaryView to remove self
    }
    
    // React to panel expansion
    onPanelExpanded(panelId: string): void {
        if (panelId === "my-panel") {
            // Scroll to highlighted item, refresh content, etc.
        }
    }
}
```

**For Pattern B** (mainEditor as secondary):
```typescript
class MyMainEditorModel extends EditorModel<MyState> {
    setPage(page: PageModel | null): void {
        super.setPage(page);
        if (page && this.isReady) {
            this.secondaryView = ["my-panel"]; // adds self to secondaryViews[]
        }
    }
    
    beforeNavigateAway(newEditor: EditorModel): void {
        if (this.isRelatedTo(newEditor)) return; // survive as secondary
        this.secondaryView = undefined; // don't survive
    }
    
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (!newMainEditor || newMainEditor === this) return; // guard self-notification
        if (!this.isRelatedTo(newMainEditor)) {
            this.secondaryView = undefined; // remove self if unrelated
        }
    }
}
```

### Step 2: Register panel components

In [`register-editors.ts`](../../src/renderer/editors/register-editors.ts):
```typescript
secondaryViewRegistry.register({
    id: "my-panel",
    label: "My Panel",
    loadComponent: async () => {
        const mod = await import("./my-editor/MySecondaryView");
        return mod.default;
    },
});
```

### Step 3: Create the React panel component

```tsx
export default function MySecondaryView({ model, headerRef }: SecondaryViewProps) {
    const myModel = model as MySecondaryModel;
    
    const headerContent = (
        <>
            My Panel Title
            <Spacer />
            <IconButton
                name="my-secondary-close"
                size="sm"
                title="Close Panel"
                icon={<CloseIcon />}
                onClick={(e) => {
                    e.stopPropagation();
                    myModel.secondaryView = undefined; // or remove specific panel
                }}
            />
        </>
    );
    
    return (
        <>
            {headerRef && createPortal(headerContent, headerRef)}
            <MyPanelContent model={myModel} />
        </>
    );
}
```

### Step 4: Create or add to `secondaryViews[]`

**For Pattern A** — create the model and add it:
```typescript
const myModel = new MySecondaryModel();
page.addSecondaryView(myModel);
// Or let the model self-register via setPage → this.secondaryView = [...]
```

**For Pattern B** — the mainEditor sets `secondaryView` on itself:
```typescript
// In the mainEditor model (e.g., in setPage or restore)
this.secondaryView = ["my-panel"];
// This automatically adds this model to page.secondaryViews[]
```

---

## 12. CategoryEditor — Provider-Agnostic Folder Viewer

**Source code:** [`CategoryEditor.tsx`](../../src/renderer/editors/category/CategoryEditor.tsx), [`CategoryEditorModel.ts`](../../src/renderer/editors/category/CategoryEditorModel.ts)

CategoryEditor is the main content area editor for `tree-category://` links. It renders CategoryView for any ITreeProvider — file system folders, archive subfolders, or future link categories.

### Provider Resolution

CategoryEditor resolves its ITreeProvider by scanning `page.secondaryViews[]`. It matches the `tree-category://` link's `type` and `url` against each secondary view's `treeProvider.type` and `treeProvider.sourceUrl`:

```
tree-category:// link: { type: "archive", url: "D:\archive.epub", category: "OEBPS" }
                                ↓ scan secondaryViews[]
    ExplorerEditorModel → treeProvider.type="file", sourceUrl="D:\temp"     → no match
    ArchiveEditorModel  → treeProvider.type="archive", sourceUrl="D:\archive.epub" → MATCH
```

This uses a duck-type interface — no EditorModel base class changes:

```typescript
interface ITreeProviderHost {
    treeProvider: ITreeProvider | null;
    selectionState: TOneState<NavigationState>;
}
```

Both `ExplorerEditorModel` and `ArchiveEditorModel` expose `treeProvider` and `selectionState` with identical signatures.

### Navigation Survival

When CategoryEditor navigates (user double-clicks a subfolder), it passes the host's model ID as `sourceId` in the ILinkData. This ensures the secondary view's `_isOpenedFromThisArchive()` check recognizes the navigation and keeps the panel alive.

### PageModel Notification

PageModel notifies the main editor when secondary views change. In `addSecondaryView()`, `removeSecondaryView()`, and `removeSecondaryViewWithoutDispose()`, PageModel checks if the main editor implements `onSecondaryViewsChanged()` and calls it. CategoryEditorModel implements this method to trigger a provider re-scan.

### Restore Timing

Secondary views are restored asynchronously after the main editor. On mount, if no provider is found, CategoryEditor retries after 50ms via `setTimeout`. This handles the case where the page is restored and the secondary view isn't ready yet.

### Breadcrumb Navigation

CategoryEditor renders a `Breadcrumb` (UIKit) on the left of its toolbar showing the path from the provider's root (`provider.displayName` as the root chip) down to the current folder. Clicking the root chip or any intermediate chip navigates the **same page** to that ancestor — it builds a `tree-category://` link via `encodeCategoryLink({ type, url: sourceUrl, category })` and dispatches `openRawLink` with the host's model ID as `sourceId` (the same mechanism as folder double-click, so the secondary panel survives the navigation). The root chip navigates to `provider.rootPath`.

The path segmentation is provider-specific because category-path conventions differ, so it is delegated to the provider via the `ITreeProvider.getCategorySegments(category)` method:

```typescript
interface ITreeProvider {
    /** Ordered breadcrumb segments root → leaf (excludes the root chip).
     *  Each segment's `category` can be fed to encodeCategoryLink({ category }). */
    getCategorySegments(category: string): ICategorySegment[]; // { label, category }
}
```

- **LinkTreeProvider / ArchiveTreeProvider** — `category` is already a `/`-separated **relative** path (`rootPath === ""`). Both delegate to the shared `relativeCategorySegments()` helper in [`tree-provider-link.ts`](../../src/renderer/content/tree-providers/tree-provider-link.ts).
- **FileTreeProvider** — `category` is an **absolute** OS path (`rootPath === sourceUrl`). Its implementation strips the `rootPath` prefix for the segment labels but keeps `/`-joined absolute paths as each segment's navigation `category` (`readdirSync` accepts `/` on Windows).

The UIKit `Breadcrumb` is used with its opt-in `clipStart` prop: on overflow it shrinks within the toolbar row and clips the **start** (root) side, keeping the trailing (current) folder visible. See [`uikit/CLAUDE.md`](../../src/renderer/uikit/CLAUDE.md) for the component contract.

### Diagram

```
PageModel
  ├── mainEditor: CategoryEditor
  │   ├── decodedLink: { type, url, category }
  │   └── scans secondaryViews[] for matching treeProvider
  └── secondaryViews:
      ├── ExplorerEditorModel (treeProvider: FileTreeProvider)
      └── ArchiveEditorModel (treeProvider: ArchiveTreeProvider)
```

## 13. Tag-Based Navigation Panel

**Source code:** [`LinkTagsSecondaryView.tsx`](../../src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx), [`LinkTreeProvider.ts`](../../src/renderer/editors/link-editor/LinkTreeProvider.ts)

When a `LinkEditor` (links, standalone) is opened as a secondary view with available tags, the Tags navigation panel (`"link-tags"`) renders two parts:

**Top:** `LinkTagsPanel` — existing tag selector (unchanged from main editor). User selects a tag, which updates shared `LinkEditor.state.selectedTag`.

**Bottom:** `LinksList` grid with links for the selected tag. Clicking a link dispatches `openRawLink` with:
- `sourceId: "link-tag"` — signals that this link came from tag-based navigation
- `selectedTag: string` — the selected tag, stored in `ILinkData.selectedTag`
- Link is opened in the same page (if standalone) or in player if appropriate

### Provider Support

Tag-based navigation requires the secondary view's `ITreeProvider` to expose:

```typescript
interface ITreeProvider {
    readonly hasTags: boolean;
    getTags?(): ITreeTagInfo[];      // All tags with counts
    getTagItems?(tag: string): ILink[]; // Links matching a tag
}
```

`LinkTreeProvider` implements both:
- `getTags()` — aggregates unique tags from all links, with item counts
- `getTagItems(tag)` — returns all (non-directory) links with the specified tag. Empty string `""` returns all non-directory links (the "All" virtual tag).

### Player Track Navigation

When `VideoEditorModel` navigates to a link with `sourceId === "link-tag"`:

1. **Lookup sibling provider:** Scans `page.secondaryViews[]` for a links editor exposing `treeProvider` + `selectByHref()` (duck-typed).
2. **Get sibling tracks:** Calls `treeProvider.getTagItems(sourceLink.selectedTag)` to list all links in the same tag.
3. **Track navigation:** `canPlayNext()`, `findSourceProvider()`, `getSiblingTracks()`, and `navigateToTrack()` all recognize `sourceId === "link-tag"` and use the tag-filtered sibling list instead of a directory listing.
4. **Selection update:** After navigation, `selectByHref()` is called to highlight the new link in the tags panel.

This pattern allows the player to treat tags as navigation containers (like folders), supporting next/previous track within a tag.

### ILinkData Additions

The `sourceId: "link-tag"` pattern uses a new field on `ILinkData`:

```typescript
export interface ILinkData {
    // ... other fields ...
    
    // ── Source tracking ───────────────────────────────────────────
    sourceId?: string;     // "link-tag", "archive-id", etc.
    selectedTag?: string;  // Tag name when opened from tag navigation
                           // Not persisted in sourceLink, re-read from sourceId on restore
}
```

`selectedTag` is **ephemeral** — not persisted to `sourceLink` because the player re-derives it on restore by reading `sourceLink.selectedTag` (which was set when the link was stored).

