# Secondary Editor System

How sidebar panels work in Persephone. Covers registration, lifecycle hooks, navigation survival, rendering, persistence, and how to add new secondary editors.

**Source code:** [`PageModel.ts`](../../src/renderer/api/pages/PageModel.ts), [`EditorModel.ts`](../../src/renderer/editors/base/EditorModel.ts), [`PageNavigator.tsx`](../../src/renderer/ui/navigation/PageNavigator.tsx)

---

## Overview

PageModel holds a `secondaryEditors[]` array of EditorModel instances that appear as sidebar panels in PageNavigator. Secondary editors can be separate models (like ExplorerEditorModel) or the mainEditor itself (like ArchiveEditorModel when browsing an archive).

```
PageModel (one per tab)
  ├── mainEditor: EditorModel              // primary content area
  ├── secondaryEditors: EditorModel[]      // sidebar panels
  │   ├── ExplorerEditorModel              // Pattern A: separate model
  │   └── ArchiveEditorModel ←── same as mainEditor  // Pattern B: mainEditor as secondary
  ├── pageNavigatorModel                   // sidebar layout: open/close/width
  ├── activePanel: string                  // which panel is expanded
  └── expandPanel(panelId)                 // expand a specific panel
```

---

## 1. Core Mechanism — the `secondaryEditor` setter

The `secondaryEditor` getter/setter on EditorModel manages `PageModel.secondaryEditors[]` membership automatically. It is `string[] | undefined` — one model can register multiple sidebar panels:

```typescript
// Setting adds the model to page.secondaryEditors[]
model.secondaryEditor = ["archive-tree"];       // one panel
model.secondaryEditor = ["explorer", "search"]; // multiple panels

// Clearing removes the model (without disposing it)
model.secondaryEditor = undefined;
```

**Internally**, the setter calls `this.page?.addSecondaryEditor(this)` or `this.page?.removeSecondaryEditorWithoutDispose(this)`. This is the ONLY way models should register/unregister themselves.

---

## 2. Two Registration Patterns

### Pattern A: Separate model (ExplorerEditorModel)

A dedicated EditorModel subclass that is ONLY a secondary editor — never becomes mainEditor.

```
PageModel
  ├── mainEditor: TextFileModel
  └── secondaryEditors: [ExplorerEditorModel]  // separate instance
```

- Created by `PageModel.createExplorer(rootPath)` or during restore
- Survives navigation — `beforeNavigateAway()` never clears (Explorer is always present)
- Disposed when user closes the panel or the page closes

### Pattern B: mainEditor as secondary (ArchiveEditorModel)

The mainEditor registers itself in `secondaryEditors[]` simultaneously. The same model instance is both `page.mainEditor` and in `page.secondaryEditors[]`.

```
PageModel
  ├── mainEditor: ArchiveEditorModel ←─── same instance
  └── secondaryEditors: [ExplorerEditorModel, ArchiveEditorModel ←─── same instance]
```

- ArchiveEditorModel sets `this.secondaryEditor = ["archive-tree"]` in `restore()` or `setPage()`
- When user navigates to a file inside the archive, ArchiveEditorModel becomes a secondary editor:
  - `beforeNavigateAway(newEditor)` checks `newEditor.sourceLink?.sourceId === this.id`
  - If the new file was opened from this archive → keeps `secondaryEditor` → **survives as secondary**
  - `setMainEditor()` checks `survivesAsSecondary = secondaryEditors.includes(oldEditor)` — if true, old editor is NOT disposed
- When user navigates to an unrelated file → `beforeNavigateAway()` clears `secondaryEditor` → removed from sidebar → disposed

**This pattern is designed into PageModel** — `setMainEditor()` explicitly handles it.

---

## 3. Lifecycle Hooks

EditorModel provides lifecycle hooks that PageModel calls at specific moments:

| Hook | Called by | When | Base behavior | Override for |
|------|-----------|------|---------------|-------------|
| `setPage(page)` | `addSecondaryEditor()`, `setMainEditor()` | Model attached to / detached from a page | Stores reference | Registration (e.g., ArchiveEditorModel sets `secondaryEditor` here) |
| `beforeNavigateAway(newEditor)` | `setMainEditor()` | Old mainEditor is about to be replaced | Clears `secondaryEditor` (remove self) | Conditional survival (check `newEditor.sourceLink`) |
| `onMainEditorChanged(newMainEditor)` | `notifyMainEditorChanged()` | After mainEditor was replaced | No-op | React to new content: highlight file in tree, clear selection, or remove self |
| `onPanelExpanded(panelId)` | `setActivePanel()` | A panel belonging to this model was expanded | No-op | Deferred reveal (scroll to highlighted item) |

---

## 4. Navigation Flow

When user navigates to a new file (`navigatePageTo()`):

```
1. page.setMainEditor(newEditor)
   ├── oldEditor.beforeNavigateAway(newEditor)
   │   ├── Base: this.secondaryEditor = undefined  → removed from sidebar
   │   └── Override (ArchiveEditorModel): keep if newEditor is from this archive
   │
   ├── survivesAsSecondary = secondaryEditors.includes(oldEditor)
   │   ├── true  → oldEditor stays alive (no dispose, no setPage(null))
   │   └── false → oldEditor.setPage(null), deferred dispose
   │
   ├── this._mainEditor = newEditor
   ├── newEditor.setPage(this)
   │
   ├── notifyMainEditorChanged()
   │   ├── For each secondary editor: m.onMainEditorChanged(newMainEditor)
   │   │   └── ArchiveEditorModel: checks sourceId, clears if unrelated → dispose
   │   │   └── ExplorerEditorModel: updates highlight, never clears
   │   └── Cleanup: remove & dispose models that cleared their secondaryEditor
   │
   └── Register new editor's secondary panel if newEditor.secondaryEditor is set
```

---

## 4b. Promote / Demote Flow

A secondary editor can be toggled into the main editor role (and back) via `promoteSecondaryToMain(model)`:

**Promote** (secondary → main):
```
1. page.promoteSecondaryToMain(model)  // model is in secondaryEditors[], not mainEditor
   └── page.setMainEditor(model)       // standard navigation lifecycle
       ├── oldEditor.beforeNavigateAway(model)
       │   └── base: this.secondaryEditor = undefined → removed from sidebar → disposed
       ├── model becomes mainEditor AND stays in secondaryEditors[] (Pattern B)
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
   │       (secondary editor component manages its own panel list via useEffect)
   └── pagesModel.resubscribeEditor(page)
```

The demote path does NOT call `setMainEditor(null)` — that would dispose the model. Instead it directly clears the reference, keeping the model alive in `secondaryEditors[]`.

**Panel save/restore:** When promoting, the current panel list is saved as `_prePromotePanels`. On demote, if saved panels exist (model was promoted from secondary), they are restored. For Pattern B (model was originally the main editor, no saved panels), panels are left unchanged — the secondary editor component (e.g., `LinkCategorySecondaryEditor`) manages the panel list reactively via `useEffect`. The `queueMicrotask` ensures this runs after React unmount cleanup.

---

## 5. Panel Management

**Active panel:** `PageModel.activePanel` tracks which panel is expanded (e.g., `"explorer"`, `"archive-tree"`). Only one panel is expanded at a time.

**Expand:** `page.expandPanel(panelId)` — sets activePanel if the panelId exists in any secondary editor's array. Calls `onPanelExpanded(panelId)` on the owning model. Used by models to auto-expand their panel (e.g., ArchiveEditorModel expands "archive-tree" when navigating to an archive entry).

**Close:** The secondary editor's React component renders a close button in its portal header. The close handler clears `model.secondaryEditor = undefined`, which removes the model from the sidebar. For user-closeable panels, this is the standard pattern.

---

## 6. Rendering in PageNavigator

**Source:** [`PageNavigator.tsx`](../../src/renderer/ui/navigation/PageNavigator.tsx)

The rendering loop nests: outer loop over models (`flatMap`), inner loop over each model's `secondaryEditor[]` panel IDs:

```tsx
secondaryEditors.flatMap((model) => {
    const panelIds = model.secondaryEditor ?? [];
    return panelIds.map((panelId) => (
        <CollapsiblePanel key={`${model.id}-${panelId}`} id={panelId}
            headerRef={setHeaderRef} alwaysRenderContent>
            <LazySecondaryEditor model={model} editorId={panelId} headerRef={...} />
        </CollapsiblePanel>
    ));
})
```

**Portal-based headers:** `CollapsiblePanel` accepts a `headerRef` callback that exposes the header `<div>`. The loaded secondary editor component uses `createPortal(headerContent, headerRef)` to render its title, buttons, and icons into the header. This lets each secondary editor fully control its header content.

**`alwaysRenderContent`:** Keeps panel content mounted when collapsed (`display: none`). Required for portal components to render headers even when their panel is collapsed.

**Reactivity:** `secondaryEditors` is a plain array (EditorModel instances can't be in TOneState — Immer proxies would corrupt them). A `secondaryEditorsVersion` counter (`TOneState<{ version }>`) is bumped on every add/remove. PageNavigator subscribes via `.use()`.

**Registry:** [`secondary-editor-registry.ts`](../../src/renderer/ui/navigation/secondary-editor-registry.ts) maps panel ID strings to React sidebar components via dynamic imports. Each registration provides an `id`, `label`, and `loadComponent()` factory.

---

## 7. Persistence

Secondary editor state is saved as `SecondaryModelDescriptor[]` in the PageModel sidebar cache (`_saveState()`). Each descriptor contains the model's serialized `IEditorState` from `getRestoreData()`.

On restore:
1. `restoreSidebar()` reads cache, stores descriptors as `pendingSecondaryDescriptors`
2. `restoreSecondaryEditors(ownerEditor)` processes them after the mainEditor is created. The `ownerEditor` parameter is nullable — pass `null` for pages without mainEditor (Pattern A standalone secondary editors).
3. **Deduplication:** If `ownerEditor` is non-null and a descriptor's ID matches `ownerEditor.id`, the existing ownerEditor instance is reused (added to `secondaryEditors[]` directly, no new model created). This handles Pattern B — when mainEditor was also a secondary editor before restart.

---

## 8. Dispose

When a tab closes:
1. `page.close()` → `confirmSecondaryRelease()` checks secondary editors for unsaved changes
2. `page.close()` → `mainEditor.confirmRelease()` checks main editor
3. `page.dispose()` → iterates `secondaryEditors[]`, calls `dispose()` on each, then disposes mainEditor
4. `page.dispose()` → `fs.deleteCacheFiles(this.id)` deletes page-level cache files (e.g., `{pageId}_nav-panel.txt`). Editor-level cache files are deleted by each `EditorModel.dispose()` call.

For Pattern B (mainEditor in secondaryEditors[]), the model may be disposed twice by `dispose()`. This is safe — `EditorModel.dispose()` is idempotent (`pipe` is nulled on first call, cache file deletion is a no-op on second call).

---

## 9. PageModel Management API

| Method | Description |
|--------|-------------|
| `addSecondaryEditor(model)` | Adds model to array, calls `model.setPage(this)`, bumps version. If model is already registered, still bumps version (panel list may have changed). |
| `removeSecondaryEditor(model)` | Removes, disposes, falls back `activePanel` if needed |
| `removeSecondaryEditorWithoutDispose(model)` | Removes without disposing (used by `secondaryEditor` setter). Skips `setPage(null)` if model is the mainEditor (Pattern B guard). |
| `promoteSecondaryToMain(model)` | Toggle: if model is secondary-only → promotes to mainEditor (old main goes through `setMainEditor` lifecycle); if model IS mainEditor → demotes (clears mainEditor to null, model stays as secondary). Calls `resubscribeEditor` for persistence. |
| `findSecondaryEditor(editorId)` | Lookup by editor model ID |
| `confirmSecondaryRelease()` | Iterates modified secondaries, prompts user via `confirmRelease()` |
| `restoreSecondaryEditors(ownerEditor)` | Restores from `pendingSecondaryDescriptors`, deduplicates against owner |
| `notifyMainEditorChanged()` | Propagates main editor change, cleans up models that cleared themselves |
| `setActivePanel(panel)` | Sets expanded panel, notifies owning model via `onPanelExpanded()` |
| `expandPanel(panelId)` | Sets activePanel if panelId exists in any secondary editor |
| `findExplorer()` | Returns the ExplorerEditorModel from secondaryEditors (if any) |
| `createExplorer(rootPath)` | Creates ExplorerEditorModel, adds to secondaryEditors |
| `getTransient<T>(key)` | Read a transient (non-persisted) runtime value by key. Returns undefined if not set. |
| `setTransient(key, value)` | Write a transient runtime value. Pass undefined to delete. Cleared on page close / app restart. |

---

## 10. Existing Secondary Editors

| Model | Panel IDs | Pattern | Survival | Created by |
|-------|-----------|---------|----------|-----------|
| `ExplorerEditorModel` | `["explorer"]` or `["explorer", "search"]` | A (separate) | Always survives navigation | `PageModel.createExplorer()` or restore |
| `ArchiveEditorModel` | `["archive-tree"]` | B (mainEditor) | Survives if new editor was opened from this archive | `_openArchive()` in PagesLifecycleModel |
| `LinkEditor` (links, main) | `["link-category", "link-tags", "link-hostnames"]` (always all 3) | B (mainEditor) | Removed on navigation (default `beforeNavigateAway`). Removed when PageNavigator closes, re-registered when it opens. First open fires `pageNavigatorToggled` via `PageModel.toggleNavigator()`. | LinkEditor component `useEffect` (subscribes to `pageNavigatorToggled` event) |
| `LinkEditor` (links, standalone) | `["link-category", "link-tags"?]` (dynamic) | A (separate) | Always survives (base `onMainEditorChanged` is no-op). Exposes `treeProvider`/`selectionState`/`selectByHref()` via duck-typing for CategoryEditor discovery and player track navigation. "link-tags" dynamically registered when tags exist. | LinkCategorySecondaryEditor useEffect (subscribes to model state for tag changes) |

---

## 11. Adding a New Secondary Editor

### Step 1: Create the EditorModel subclass (or use an existing mainEditor model)

**For Pattern A** (separate model):
```typescript
class MySecondaryModel extends EditorModel<MyState> {
    // Set secondaryEditor when ready
    setPage(page: PageModel | null): void {
        super.setPage(page);
        if (page && this.isReady) {
            this.secondaryEditor = ["my-panel"];
        }
    }
    
    // Decide survival on navigation
    beforeNavigateAway(newEditor: EditorModel): void {
        if (this.shouldSurvive(newEditor)) return; // keep secondaryEditor set
        this.secondaryEditor = undefined; // clear → removed from sidebar
    }
    
    // React to main editor changes
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (!newMainEditor || newMainEditor === this) return;
        // Update highlights, or clear secondaryEditor to remove self
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
            this.secondaryEditor = ["my-panel"]; // adds self to secondaryEditors[]
        }
    }
    
    beforeNavigateAway(newEditor: EditorModel): void {
        if (this.isRelatedTo(newEditor)) return; // survive as secondary
        this.secondaryEditor = undefined; // don't survive
    }
    
    onMainEditorChanged(newMainEditor: EditorModel | null): void {
        if (!newMainEditor || newMainEditor === this) return; // guard self-notification
        if (!this.isRelatedTo(newMainEditor)) {
            this.secondaryEditor = undefined; // remove self if unrelated
        }
    }
}
```

### Step 2: Register panel components

In [`register-editors.ts`](../../src/renderer/editors/register-editors.ts):
```typescript
secondaryEditorRegistry.register({
    id: "my-panel",
    label: "My Panel",
    loadComponent: async () => {
        const mod = await import("./my-editor/MySecondaryEditor");
        return mod.default;
    },
});
```

### Step 3: Create the React panel component

```tsx
export default function MySecondaryEditor({ model, headerRef }: SecondaryEditorProps) {
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
                    myModel.secondaryEditor = undefined; // or remove specific panel
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

### Step 4: Create or add to `secondaryEditors[]`

**For Pattern A** — create the model and add it:
```typescript
const myModel = new MySecondaryModel();
page.addSecondaryEditor(myModel);
// Or let the model self-register via setPage → this.secondaryEditor = [...]
```

**For Pattern B** — the mainEditor sets `secondaryEditor` on itself:
```typescript
// In the mainEditor model (e.g., in setPage or restore)
this.secondaryEditor = ["my-panel"];
// This automatically adds this model to page.secondaryEditors[]
```

---

## 12. CategoryEditor — Provider-Agnostic Folder Viewer

**Source code:** [`CategoryEditor.tsx`](../../src/renderer/editors/category/CategoryEditor.tsx), [`CategoryEditorModel.ts`](../../src/renderer/editors/category/CategoryEditorModel.ts)

CategoryEditor is the main content area editor for `tree-category://` links. It renders CategoryView for any ITreeProvider — file system folders, archive subfolders, or future link categories.

### Provider Resolution

CategoryEditor resolves its ITreeProvider by scanning `page.secondaryEditors[]`. It matches the `tree-category://` link's `type` and `url` against each secondary editor's `treeProvider.type` and `treeProvider.sourceUrl`:

```
tree-category:// link: { type: "archive", url: "D:\archive.epub", category: "OEBPS" }
                                ↓ scan secondaryEditors[]
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

When CategoryEditor navigates (user double-clicks a subfolder), it passes the host's model ID as `sourceId` in the ILinkData. This ensures the secondary editor's `_isOpenedFromThisArchive()` check recognizes the navigation and keeps the panel alive.

### PageModel Notification

PageModel notifies the main editor when secondary editors change. In `addSecondaryEditor()`, `removeSecondaryEditor()`, and `removeSecondaryEditorWithoutDispose()`, PageModel checks if the main editor implements `onSecondaryEditorsChanged()` and calls it. CategoryEditorModel implements this method to trigger a provider re-scan.

### Restore Timing

Secondary editors are restored asynchronously after the main editor. On mount, if no provider is found, CategoryEditor retries after 50ms via `setTimeout`. This handles the case where the page is restored and the secondary editor isn't ready yet.

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
  │   └── scans secondaryEditors[] for matching treeProvider
  └── secondaryEditors:
      ├── ExplorerEditorModel (treeProvider: FileTreeProvider)
      └── ArchiveEditorModel (treeProvider: ArchiveTreeProvider)
```

## 13. Tag-Based Navigation Panel

**Source code:** [`LinkTagsSecondaryEditor.tsx`](../../src/renderer/editors/link-editor/panels/LinkTagsSecondaryEditor.tsx), [`LinkTreeProvider.ts`](../../src/renderer/editors/link-editor/LinkTreeProvider.ts)

When a `LinkEditor` (links, standalone) is opened as a secondary editor with available tags, the Tags navigation panel (`"link-tags"`) renders two parts:

**Top:** `LinkTagsPanel` — existing tag selector (unchanged from main editor). User selects a tag, which updates shared `LinkEditor.state.selectedTag`.

**Bottom:** `LinksList` grid with links for the selected tag. Clicking a link dispatches `openRawLink` with:
- `sourceId: "link-tag"` — signals that this link came from tag-based navigation
- `selectedTag: string` — the selected tag, stored in `ILinkData.selectedTag`
- Link is opened in the same page (if standalone) or in player if appropriate

### Provider Support

Tag-based navigation requires the secondary editor's `ITreeProvider` to expose:

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

1. **Lookup sibling provider:** Scans `page.secondaryEditors[]` for a links editor exposing `treeProvider` + `selectByHref()` (duck-typed).
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

