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
| `onPanelExpanded(panelId)` | `setActivePanel()` | A panel belonging to this model was expanded | No-op | Deferred reveal (scroll to highlighted item); sync derived state from the active panel |

`onPanelExpanded` runs on the **model**, so it fires whenever the active panel changes —
regardless of whether the editor's main-view component is mounted. Prefer it over a
view-level subscription for any state that must stay in sync while the editor is demoted to a
sidebar (its main view unmounts then). For example, the Link editor maps the expanded panel
(Collections / Tags / Hostnames) to its current filter + breadcrumb here, so switching panels
keeps working after navigating away to one of its links.

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
- **Remove the whole Pattern B editor** (`page.removeSecondaryView(model)`): detaches *and disposes* the model. Because `detach()` clears `mainEditorId` when the editor was also the main, this leaves the page empty if the editor was main, and leaves a different main untouched otherwise. Used by `ArchiveSecondaryView` and by `GitTreeEditorModel.requestClose()` (the Git Tree "x"). The Git Tree "x" is intentionally **unconditional** (unlike `ArchiveSecondaryView`, which hides its "x" while it is the main), because the empty-page outcome is the intended behavior.

---

## 5a. Composite Panel Keys

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

**Seed/legacy resolution:** the default `activePanel` seed (`"explorer"`) and any legacy persisted bare value are resolved to their composite at render time in `SecondaryViews` (a bare value is matched against the rendered panels' bare ids). After any accordion click, `activePanel` is already composite.

**Same-type dedup is a model-level concern, not a render-level one.** Re-clicking the *same* repo's `.git` reuses the existing `GitTreeEditorModel` via `matchesNavigationTarget` (see [pages-architecture.md §9](pages-architecture.md)), so no duplicate model is created. Different repos correctly produce distinct models, and the sidebar renders a `"git-changes"` panel for each. `CollapsiblePanelStack` (UIKit) is untouched — it operates on whatever id string it is given, so feeding it composite keys needs no change.

---

## 6. Rendering in SecondaryViews

**Source:** [`SecondaryViews.tsx`](../../src/renderer/ui/secondary-views/SecondaryViews.tsx)

The rendering loop nests: outer loop over models (`flatMap`), inner loop over each model's `secondaryView[]` panel IDs. Every `(model, panelId)` pair is rendered — there is **no** panel-id-uniqueness restriction (the page may render multiple panels of the same type — one per repo). The `CollapsiblePanel` `id` is the **composite** key (§5a); the registry lookup and the `LazySecondaryView panelId` prop stay **bare**:

```tsx
secondaryViews.flatMap((model) => {
    const panelIds = model.secondaryView ?? [];
    return panelIds
        .filter((panelId) => secondaryViewRegistry.has(panelId))
        .map((panelId) => {
            const icon = secondaryViewRegistry.get(panelId)?.icon ?? <EditorIcon editor={model} />;
            return (
                <CollapsiblePanel key={`${model.id}-${panelId}`} id={panelKey(model.id, panelId)}
                    headerRef={setHeaderRef} alwaysRenderContent>
                    <LazySecondaryView model={model} panelId={panelId} headerRef={...} icon={icon} />
                </CollapsiblePanel>
            );
        });
})
```

The React `key` stays the `${model.id}-${panelId}` ref-key; the accordion identity is the composite `id`. `activePanel` (composite) is passed to `CollapsiblePanelStack` after the bare-seed resolution described in §5a.

**Panel header icon:** each panel header leads with an icon so panels from different editors are distinguishable at a glance. The icon is resolved here — **per-panel registry override first, owning-editor icon otherwise** — `secondaryViewRegistry.get(panelId)?.icon ?? <EditorIcon editor={model} />`. `EditorIcon` ([`components/icons/EditorIcon.tsx`](../../src/renderer/components/icons/EditorIcon.tsx)) is the **shared resolver** that produces the same glyph an editor shows on its page tab (see [editors.md](editors.md#editor-icons)). The resolved node is **not** handed to `CollapsiblePanel`; it is passed down to the panel component as `SecondaryViewProps.icon` (via `LazySecondaryView`), and the panel forwards it to `SideBarPanelHeader`, which renders it as the leading glyph. Resolution stays here because this is the only layer with the registry + editor in scope.

**Portal-based headers — `SideBarPanelHeader`:** `CollapsiblePanel` accepts a `headerRef` callback that exposes the header `<div>`. Each secondary view renders a [`SideBarPanelHeader`](../../src/renderer/ui/secondary-views/SideBarPanelHeader.tsx), which `createPortal`s its content into that `<div>`. The component takes `icon`, `badge` (optional, e.g. a repo-name `Tag`), `title`, and `actions` (the panel's buttons), and lays them out as `[icon] [title group] [actions] [show-main zone]`:

- the **icon** is rendered first and unwrapped so it stays a direct child of the header `<div>` — the stack's `[data-part="header"] > svg { width: 14; height: 14 }` rule sizes only direct-child SVGs;
- the **title group** (`badge` + `title`) is a flex-grow `Panel` with `width={0}` + `overflow: hidden`, so the title (`<Text truncate size="md">`) and a `truncate` `Tag` badge ellipsize as the sidebar narrows;
- the **actions** region is a `Panel` with `shrink={false}`, so the buttons stay pinned and fully visible — the label group is what gives way, never the buttons;
- the **show-main zone** is a standardized right-edge button (chevron-right icon, separated by a vertical divider) that appears when the `onShowMain` prop is provided. Clicking it promotes the editor to the page's main view (`stopPropagation` prevents panel toggle). Pass `showMainTitle` to override the tooltip (default: `"Show in main view"`) and `showMainActive={true}` to tint the chevron blue when this editor is already the main view. The zone is always visible — it does not hide when already main; the active tint is the indicator instead.

This replaces per-panel hand-rolled `createPortal` + layout. Because portalled content lives in a separate React fiber tree, its clicks would bubble to the panel body rather than the header's toggle `onClick`; `CollapsiblePanelStack` makes non-interactive label primitives (`Text`, `Tag`, `Panel`) click-through (`pointer-events: none`) so a click on the title still toggles the panel, while interactive controls (`button`, `icon-button`, clickable `Tag`) re-assert pointer events. The show-main zone (`data-type="sidebar-show-main"`) is in the `pointer-events: auto` allowlist and guards the header's hover-lighten with `:not(:has([data-type="sidebar-show-main"]:hover))` so the header bar and the zone light up independently.

**`alwaysRenderContent`:** Keeps panel content mounted when collapsed (`display: none`). Required for portal components to render headers even when their panel is collapsed.

**Reactivity:** `secondaryViews` is a plain array (EditorModel instances can't be in TOneState — Immer proxies would corrupt them). A `secondaryViewsVersion` counter (`TOneState<{ version }>`) is bumped on every add/remove. SecondaryViews subscribes via `.use()`.

**Registry:** [`secondary-view-registry.ts`](../../src/renderer/ui/secondary-views/secondary-view-registry.ts) maps panel ID strings to React sidebar components via dynamic imports. Each registration provides an `id`, `label`, `loadComponent()` factory, and an optional `icon` — a per-panel header-icon override for sidebar-only sub-panels that want their own glyph instead of the owning editor's icon (e.g. the Explorer `"search"` panel registers a `SearchIcon`). Panels that omit `icon` fall back to the editor icon. Alongside the exact-id `register()`, the registry exposes **`registerPrefix(prefix, definition)`**: a panel id that *starts with* a registered prefix resolves to that one definition (checked by `get()`/`has()` after the exact-id map misses), so one registration serves an entire id family and the component reads `SecondaryViewProps.panelId` to specialize. The `board-secondary:` family uses this so a single generic `BoardSecondaryView` component serves every board's declared secondary views (see [editors.md](editors.md#board-secondary-views--shared-state)).

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
| `LinkEditor` (links) | `["link-category", "link-tags", "link-hostnames"]` (always all 3) | B (mainEditor) | Survives own-link navigation (`sourceId` = editor id / `link-category` / `link-tag` / `link-hostname`) **or while modified** (a dirty collection survives any navigation so unsaved work is never lost); otherwise removed on external navigation. Overrides `beforeNavigateAway` / `onMainEditorChanged`; the same `modified \|\| own-source` predicate drives `survivesNavigation` (skips the save-prompt). | `adoptHost()` sets `secondaryView = LINK_PANELS` |
| `NotebookEditor` | `["notebook-categories", "notebook-tags"?]` | B (mainEditor) | Removed on navigation (default `beforeNavigateAway`). Removed when SecondaryViews closes, re-registered when it opens. "notebook-tags" only when tags exist. | NotebookBody `useEffect` (subscribes to `secondaryViewsToggled` event) |
| `RestClientEditor` | `["rest"]` | B (mainEditor) | Removed on navigation (default `beforeNavigateAway`). Removed when SecondaryViews closes, re-registered when it opens. | RestClientBody `useEffect` (subscribes to `secondaryViewsToggled` event) |
| `LinkEditor` (browser bookmarks) | `["link-category", "link-tags", "link-hostnames"]` | B — hosted on `BrowserPanelHost` (not `PageModel`) | Always present while the browser page is open; sidebar is mandatory-open. | `BrowserPanelHost.attach()` — called by `BrowserEditorModel` during bookmarks init |
| `GitTreeEditorModel` | `["git-changes"]` (label "Git") | B (mainEditor) | **Unconditional survival** — `beforeNavigateAway()` is a no-op, so the panel stays when clicking a changed file or a ref opens its Git Diff (the editor becomes secondary-only). Sole removal path is the panel's manual "x" → `requestClose()` → `page.removeSecondaryView(this)` (tears down the whole editor). Also a per-page navigation-singleton (`matchesNavigationTarget` / `onNavigationReuse`): re-navigating to the same repo reuses this instance instead of stacking duplicates. See [Git Tree panel](#git-tree-panel) below for behavior. | `setPage()` sets `secondaryView = ["git-changes"]` on attach (unconditionally, so a session that persisted an older multi-panel array is migrated) |
| `FileDiffEditor` | `["git-diff-revisions"]` (label "File History") | B (mainEditor) | **Removed on navigation AND editor-switch** — uses the **default** `beforeNavigateAway` (clears `secondaryView`), so the "File History" panel disappears when the page navigates to another file or when the Git Diff is switched back to the Text Editor. The deliberate **opposite** of `GitTreeEditorModel`'s unconditional survival (the panel is meaningful only while its Git Diff is the main editor). | `adoptHost()` sets `secondaryView = ["git-diff-revisions"]` |
| `BoardEditorModel` (+ subclasses) | `["board-secondary:<viewId>", …]` (declared) | Board (see note) | Removed on navigation — base `beforeNavigateAway` clears the derived list; `secondaryViewDefs` is retained so a re-promoted **busy** board re-derives its panels (`onNavigationReuse()`) | Derived from `board-manifest.json` `secondaryViews` and/or `persephone.setSecondaryViews([...])` at runtime |

**Board secondary views** are a distinct mechanism layered on this system: a board declares zero-or-more views, each mapped to a `board-secondary:<viewId>` panel id (an id *family*, not a fixed set). Unlike the built-in editors above — where one registration serves one panel id — the registry resolves the **whole `board-secondary:*` family to one generic component** (`BoardSecondaryView`, prefix-aware `has()`/`get()`), and every panel renders over the **same** board model (so they share `persephone.state.*` and, for content-host boards, the content host). See [editors.md → Board Secondary Views & Shared State](editors.md#board-secondary-views--shared-state) for the full model (frames, `isMain`, shared-state bridge, automation).

### Git Tree panel

`GitTreeEditorModel` hosts **one** panel next to the commit graph — `"git-changes"` (label "Git") — composed over focused submodels (`changes`, `branches`, plus `gitTree` for the graph), mirroring how `BrowserEditor` composes submodels. All share the editor's repo root and refresh path. The panel body is split into three segments by an in-body `SegmentedControl` (`Changes` / `Branches` / `Tags`, default `Changes`); the active segment is persisted as `gitPanelTab` in the editor descriptor so it survives navigation + restart.

The panel is assembled from a container plus three header-less segment bodies:
- `GitPanelSecondaryView` — the registered panel: owns the shared `SideBarPanelHeader`, the segment `SegmentedControl`, and the segment-switch wiring.
- `GitChangesView` — the `Changes` segment (working-tree status).
- `GitRefsView` — the `Branches` (`show="branches"`) and `Tags` (`show="tags"`) segments.

**Multiple repos coexist.** Opening a second repo's `.git` creates a second `GitTreeEditorModel`, so the page shows one panel per repo (distinct composite keys — see §5a). Each header leads with the repository name (`model.repoName`) rendered as an outlined `Tag` badge — mirroring the Git Tree editor toolbar — to disambiguate.

**Header.** Title is a static `Git (<n>)` where `<n>` is the unique changed-file count — the union of the unstaged + staged repo-relative paths, so a partially-staged file (present in both lists) is counted once; it reads plain `Git` when there are no changes. The count lives in the header (not a segment) so it stays visible while the panel is collapsed, letting the user spot which repos have changes without expanding each one. The header carries **Refresh**, the editor's sole manual **"x"** close (`requestClose()` — tears down the whole editor), and the **"Show Git Tree"** promote-to-main zone (`model.showGitTree()`). The **"AZ"** sort toggle lives in the body toolbar next to the SegmentedControl and shows only for the `Branches` / `Tags` segments.

**Commit-graph row context menu.** Right-clicking a commit row in the graph offers the same "Switch to …" actions as the Branches segment plus **"Create branch here…"** (`createBranchAt` → name prompt → `git switch -c <name> <commit>`, creating + checking out a branch at that commit; invalid/duplicate names toast). Single-commit only — disabled on a multi-row selection.

**Visibility-aware refresh.** A recursive `DirectoryWatcher` on the repo root (debounced 500 ms, started in `syncGitTree()`, disposed in `dispose()`; always-on under `git.enabled`) drives `refresh()` on any repo change — including edits, staging, commits, and checkouts (the watch covers `.git`). `refresh()` reloads only the **currently-visible** surfaces and marks the others stale; a stale surface reloads lazily when next revealed. Visibility is segment-aware: the `changes` submodel counts as visible only when the panel is expanded **and** the `Changes` segment is active; the `branches` submodel (shared by `Branches` and `Tags`) only when one of those segments is active. Switching segments (`setGitPanelTab`) and expanding the panel (`onPanelExpanded`) both reload the now-active segment's submodel if it went stale while hidden. To keep the watch loop-free, the reads (`git status`, `git for-each-ref`) run with `GIT_OPTIONAL_LOCKS=0` (`git-service.ts`) so they never rewrite `.git/index` and re-trigger the watcher.

#### `Branches` / `Tags` segments (`GitRefsView`)

A refs tree built by `git-refs-tree.ts` (`buildRefsTree`) from the `GitRefs` DTO, with three fixed roots: **Branches** (local, with `/`-folder nesting), **Remotes** (one node per remote, branches nested), and **Tags** (flat). `GitRefsView` renders a subset by segment: `show="branches"` shows the Branches + Remotes roots; `show="tags"` shows the tag leaves flat.

- **Active branch** reads head-green (`REF_COLOR.head`) — icon + label — matching the graph's current-branch decoration; no selection background.
- **Ordering** is historical (most-recent-first) by default; the body-toolbar **"AZ" toggle** switches to alphabetical (persisted as `branchesAlphabetical` in the editor descriptor, shared by both ref segments). The git service sorts refs by committer/creator date; `buildRefsTree(refs, alphabetical)` either preserves that order (folders interleave by most-recent member) or sorts by name.
- **Hover** highlight uses the `Tree`'s controlled `activeIndex` / `onActiveChange`.
- **Click-to-reveal:** clicking a ref focuses its commit's "Comment" cell in the graph (`GitTreeModel.revealRef` via the registered `AVGridModel` handle from `setGrid`); if the ref's tip isn't among the loaded commits, the last row is focused so "Load more / Load all" is in view. Guarded by `isTreeVisible()` (the grid is mounted only when the Git Tree is the page's main editor).
- **Switch context menu** (right-click a leaf): "Switch to Branch" (local; current branch disabled), "Switch to Remote Branch" (creates/reuses a local tracking branch), or "Switch to Tag '<name>' Commit" (detached HEAD at the tagged commit). All call `model.switchTo()`.

#### `Changes` segment (`GitChangesView`)

The working-tree view: unstaged (top) + staged (bottom) `FileGrid`s split by a `Splitter`.

- **Stage / unstage / commit.** A bar above the Staged grid carries a "Commit" button (left) + the stage/unstage arrows (right). Commit opens the modal `showCommitDialog` (`ui/dialogs/CommitDialog.tsx`) — an editable **required** branch field (red border when empty, via the UIKit `Input` `invalid` prop) + editable author Name/Email (prepopulated from git config) + message. The author identity is applied as a per-commit `-c` override (no config file is written); the `buttons` array is forward-compatible for a future "Commit and Push".

  The dialog **drives the commit itself** and is git-agnostic: the caller injects an `onAction` callback (which calls `model.changes.commit(message, identity?, newBranch?)`), and the dialog gates closing on it via `TDialogModel.canClose` — staying open on failure (e.g. an invalid or duplicate branch name) for a fix-and-retry, closing only on success, with its action buttons disabled while in flight (`committing`). Keeping the prefilled current branch commits to it; editing the name — or a detached HEAD, whose field starts empty — creates **and checks out** a new branch first (`git switch -c`, which carries the staged index) so the commit lands on it. The dialog compares the edited value against the open-time branch (`originalBranch`) and relabels the action button **"Create Branch & Commit"** in that case (the button's action identity stays `"Commit"`). Requiring a branch even when detached is deliberate — it turns what would be a dangling commit into one kept on a real branch.
- **Stage/unstage/reset** are also available via double-click and a right-click context menu on the file grid (`FileGrid`).
- **Single click opens the file's Git Diff** in the page (`openChangeDiff(change, list)`). The list the click came from picks the preselected comparison: the **Staged** list opens `Last commit (HEAD) ↔ Staged` so a fully-staged file shows real changes; the **Unstaged** list keeps the editor's default `Staged ↔ Unstaged`. The selection rides the link pipeline (`diffFrom`/`diffTo` hints) — no direct editor call.

The File Diff "File History" panel (`["git-diff-revisions"]`) shows the file's filtered commit history with synthetic Unstaged/Staged rows + per-row L/R (from/to) side-select toggles bound to the editor's single `from`/`to` state. The same `from`/`to` can be **preselected when the diff opens** via the `diffFrom`/`diffTo` link hints — e.g. opening a commit's changed file in a new tab as `previous commit ↔ selected commit`. The editor exposes `applyDiffRevisions(from, to)`, consumed once on a fresh build and guarded against the default-resolution pass (`initDiffDefaults`) so an explicit selection is never overwritten.

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

Render a `SideBarPanelHeader` — it owns the portal and the layout (forward the `icon` from props; pass `title`, an optional `badge`, and the buttons as `actions`):

```tsx
export default function MySecondaryView({ model, headerRef, icon }: SecondaryViewProps) {
    const myModel = model as MySecondaryModel;

    return (
        <>
            <SideBarPanelHeader
                headerRef={headerRef}
                icon={icon}
                title="My Panel Title"
                actions={
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
                }
            />
            <MyPanelContent model={myModel} />
        </>
    );
}
```

A title-only panel is just `<SideBarPanelHeader headerRef={headerRef} icon={icon} title="My Panel" />`. Conditional buttons stay inside the `actions` node (`actions={cond && <IconButton.../>}`).

`SecondaryViewProps` also carries `expanded` — `true` when this panel is the one currently expanded in the stack, `false` when it is collapsed to a header strip. Panels stay mounted while collapsed (`alwaysRenderContent`), and the header is portalled in regardless, so an action that only makes sense while the body is visible should be gated on this flag (`actions={<>{expanded && <PrimaryButton/>}<CloseButton/></>}`). The Boards panel uses it to hide its "+ New board" button when collapsed, leaving just the title + close button on the header strip.

To add a standardized "show main view" button at the right edge, pass `onShowMain` (a callback that calls `page.promoteSecondaryToMain(model)` or an editor-specific equivalent) and optionally `showMainActive` (blue-tints the chevron when the editor is already main) and `showMainTitle` (tooltip override). The zone is always rendered when `onShowMain` is provided — never hidden, even when already main:

```tsx
<SideBarPanelHeader
    headerRef={headerRef}
    icon={icon}
    title="My Panel Title"
    onShowMain={() => model.page?.promoteSecondaryToMain(model)}
    showMainActive={model.page?.mainEditor === model}
    actions={/* ... */}
/>
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

