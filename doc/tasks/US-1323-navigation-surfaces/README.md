# US-1323 - Folder View, Git Tree, and the Explorer sidebar panels

Epic: [EPIC-087 - The data editors through `call`, and the retirement of `ui_push`](../../epics/EPIC-087.md)

## Goal

Make the three read-mostly navigation surfaces visible and useful through `call`: Folder View
(`category-view`), Git Tree (`git-tree`), and the Explorer/Search/Boards/Git sidebar panels.
For part C, preserve the existing `page.panels` members and add live child nodes through the
existing `children()`/`provide()`/`index()` pattern, covering all listed cross-reference panels
with generic nodes while filling model-backed state/elements for Explorer, Search, Boards, and Git.

**Status: Implemented 2026-09-06** (review deferred to epic close, per the epic model).

Verified live through `call`: `page.panels` now lists nine panel members; `panels.explorer` answered
`rootPath`, `selectedHref` and `providerType` on a page whose sidebar was open, and its eleven
elements are double-scoped — by page id *and* by the panel's own `[data-type="collapsible-panel"]`
root — so two panels on one page cannot answer for each other. A panel not present on the page
(`panels.rest`) reported absent rather than fabricating a node. Clicking through to a Git Tree page
gave `repoRoot`, `currentRef: "upcoming-v4.0.24"` and `loadedCommitCount: 200`, the documented cap.
The Git facade exposes only `refresh`, `loadMore`, `openChange` and `revealRef` — no repository
mutation, as decision 9 requires.

**One bug was found during verification and is NOT this task's:** `pages.openFile()` given a
*directory* path returns `null` and leaves an "Empty" page that is rendered as a tab but is absent
from the object model, so `pages` and the tab strip disagree and `activePageId` names a page
`pages[id]` cannot resolve. Confirmed **pre-existing** by stashing this task's entire diff and
reproducing it on a clean tree. Recorded as Needs user check 2 in the epic.

## Background

This document is a plan only: it does not implement facades, change the dashboard, add tests or
harnesses, edit generated assets by hand, or commit.

### Source-verified topology

`category-view` is registered as the Folder View editor at
`src/renderer/editors/register-editors.ts:176`; its module decodes `tree-category://` links in
`src/renderer/editors/category/index.ts:8-22` and its model is
`CategoryEditorModel.ts`. It is a no-content-host editor: the registry row has no
`hasContentHost`, and the registry default is `false` at `register-editors.ts:210`.
`CategoryEditorView` currently owns the provider lookup, selection forwarding, item navigation,
breadcrumb navigation, and the local view-mode value (`CategoryEditor.ts:125-350`). The model
currently owns only decoded-link state (`CategoryEditorModel.ts:20-55`), so the reusable provider
and navigation paths must be moved to the model before a facade exposes them.

`git-tree` is registered at `register-editors.ts:177`, is created from a decoded `git-tree://`
link by `src/renderer/editors/git-tree/index.ts:8-22`, and is a standalone no-content-host editor.
`GitTreeEditorModel.ts:92-118` composes the model-backed `GitTreeModel`, `GitChangesModel`, and
`GitBranchesModel`; the three submodels own commit history, working-tree status, and refs. The
main view and merged Git panel already route most visible behavior through the editor model
(`GitTreeEditorView.ts:186-271,541-628` and `GitPanelSecondaryView.ts:81-132,225-257`), but the
selected commit remains view-local at `GitTreeEditorView.ts:142,530-537`, and the commit detail
and commit-diff views have their own view lifecycles. The facade must expose model state only and
must not inspect those mounted view objects.

Explorer, Search, and Boards are secondary views, not editor-registry editors:
`register-editors.ts:19-41` registers their panel ids and view loaders. `ExplorerEditorModel` is
an `EditorModel` subclass with `editorId = "explorer"` used for persistence only
(`src/renderer/editors/explorer/ExplorerEditorModel.ts:43-59`); its view supplies the
`FileTreeProvider` (`ExplorerSecondaryView.ts:185-216`). Provisioning is page-scoped in
`src/renderer/editors/explorer/page-explorer.ts:19-78`: `explorerRootForPanels`, `autoInitExplorer`,
and `toggleNavigator` attach or reveal an Explorer model. Search and Boards are dynamic siblings
of the same Explorer model (`ExplorerEditorModel.ts:99-155`), so their nodes must resolve through
the owning Explorer model rather than through a view instance.

The merged Git sidebar panel is the registered `git-changes` secondary view
(`register-editors.ts:80-84`) rendered by `GitPanelSecondaryView`; its visible tabs are Changes,
Branches, and Tags (`GitPanelSecondaryView.ts:81-103`). `git-diff-revisions` is a separate File
History secondary view (`register-editors.ts:86-90`), not part of the merged Git node.

### Decision 10: `page.panels` mechanism and dynamic children

Read `src/renderer/scripting/ai-vision/page-panels.ts:51-123` as the implementation boundary.
`PagePanelsNode.projectItems()` derives live panel membership by iterating `host.panelEditors`,
reading each editor's persisted `secondaryView` ids, filtering them through
`secondaryViewRegistry.has()`, and preserving the owner editor id and expanded state. The current
`items` getter returns `[]` without a host, while `isOpen` and `width` read the lazy sidebar model
without creating it. This proves both that panel existence is page-scoped/dynamic and that the
new child lookup must not cache a global panel list or create a sidebar while reading.

The read contract is explicit in `src/shared/ai-vision/types.ts:66-67`: "Dynamic children that
exist right now. Must be cheap and side-effect free." Because `children()` is evaluated while
hints are generated for every page, `children()`, `provide()`, and `index()` may read only the
already-known `host.panelEditors` state and registered panel ids. They must never call
`explorerRootForPanels`, `autoInitExplorer`, or `toggleNavigator` from
`src/renderer/editors/explorer/page-explorer.ts:19-78`, and must not create a lazy sidebar model
or any secondary view. A known alias whose panel is absent returns `undefined`; an absent exact id
returns `undefined` from `index()` so the existing resolver emits its normal `No item ...`
diagnostic. This is important because the existing grouped-page member deliberately documents
that reading it creates a page when missing; panel enumeration must not acquire that side effect.

The same AI-vision protocol already exposes dynamic children without reflection. `PageCollectionWrapper`
lists every live page in `children()` and resolves numeric/id access through `index()`
(`src/renderer/scripting/api-wrapper/PageCollectionWrapper.ts:75-105`); `MenusNode` lists an open
popup only when it exists and resolves `[0]` through `index()`
(`src/renderer/scripting/ai-vision/menus/index.ts:146-166`); `DialogsNode` maps the live dialog
stack to indexed adapters (`src/renderer/scripting/ai-vision/dialogs/index.ts:69-103`). The shared
resolver permits a live child segment even when it is not in static `members`
(`src/shared/ai-vision/resolver.ts:92-100,166-178`), and renderer descriptors may compute such
members through `provide()` (`src/renderer/scripting/ai-vision/elements.ts:77-117`). The panel
implementation follows these existing seams rather than inventing a second registry or a DOM
lookup protocol.

Before:

```ts
get panels(): PagePanelsNode {
    return new PagePanelsNode(() => this.model.page);
}

get aiVision(): IAiVisionDescriptor {
    return {
        kind: "PagePanels",
        members: [...PAGE_PANELS_MEMBERS, ...elements.members],
        provide: elements.provide,
    };
}
```

After:

```ts
get panels(): PagePanelsNode {
    return new PagePanelsNode(() => this.model.page);
}

get aiVision(): IAiVisionDescriptor {
    return {
        kind: "PagePanels",
        members: [...PAGE_PANELS_MEMBERS, ...PANEL_NODE_MEMBERS, ...elements.members],
        children: () => this.children(),
        index: (key) => this.index(key),
        provide: (name) => this.provide(name) ?? elements.provide(name),
    };
}
```

`PANEL_NODE_MEMBERS` contains the fixed public aliases and marks each as `node: true`; the live
`children()` list includes only present nodes. `provide()` returns the current specialized
`PagePanelNode` for a present alias and an `undefined` value for a known-but-absent alias. `index()`
accepts both the alias and the exact registered id, returning `undefined` when no live owner
contributes that id. Multiple owners of one bare panel id follow the existing `items`/`expand`
precedent: the first rendered owner is used, while `items` exposes each owner id so an agent can
see the ambiguity. Dynamic `board-secondary:<viewId>` ids remain indexable by their exact id and
are listed as live children using a safe generated alias; no fixed board-member list is invented.

Public aliases are:

| Alias | Registered panel id(s) | Owner/state source |
| --- | --- | --- |
| `explorer` | `explorer` | `ExplorerEditorModel` |
| `search` | `search` | `ExplorerEditorModel.searchState` |
| `boards` | `boards` | `ExplorerEditorModel.boardsOpen` plus board/tool registries |
| `git` | `git-changes` | `GitTreeEditorModel` |
| `notebookCategories` | `notebook-categories` | `NotebookEditor` |
| `notebookTags` | `notebook-tags` | `NotebookEditor` |
| `rest` | `rest-panel` | `RestClientEditor` |
| `archive` | `archive-tree` | `ArchiveEditor` |
| `fileHistory` | `git-diff-revisions` | `FileDiffEditor` |

The public type in `src/renderer/api/types/page-panels.d.ts` will add the node interfaces and
optional alias members while preserving the existing `IPagePanels` members verbatim. The runtime
node's `id` remains the registered id (`git-changes`, `archive-tree`, and so on); the alias is only
the convenient object-model path. Every node has its own generic `state` snapshot and `elements`
member; deferred nodes use an empty `elements` list and do not claim panel-specific state. Current
task nodes fill both with their model-backed projection. `page.panels.items` remains the
authoritative complete live projection, including duplicate owners and arbitrary registered panels.

### Decision 7: beside-the-facade data paths

None of these three surfaces is a content-host editor. Folder View and Git Tree have no
`hasContentHost` registration and inherit `EditorModel.contentHost === null`
(`src/renderer/editors/base/EditorModel.ts:242-244`); Sidebar panel nodes are secondary-view
models, not page content editors. Consequently, no member accepts a secret and no facade claims a
redaction boundary. The absence of `page.content` data is a scope decision describing these
surfaces, not a security guarantee: `app.fs` can still read the disk.

- Folder View's path beside the facade is the decoded `tree-category://` link and provider-backed
  file/archive/link listing, not page text. The facade exposes the page's current category and
  copied item metadata; it does not pretend to protect files available through `app.fs`.
- Git Tree's path beside the facade is the decoded `git-tree://` repository link and the Git API
  itself. The facade exposes copied Git metadata and state; it does not claim to protect repository
  contents or credentials that an agent can obtain through other permitted APIs.
- Sidebar panels have no adjacent page-content path of their own. Their state is derived from the
  owning page/editor models and existing registries. A panel node describes what this sidebar shows,
  not a security boundary over the underlying filesystem, board store, notebook, REST, archive, or
  Git data.

## Implementation Plan

### 1. Define the public snapshots and panel-node contract

Add self-contained declarations under `src/renderer/api/types/`:

- `folder-view-editor.d.ts`: `IFolderViewEditor`, copied `IFolderItem` snapshots, provider type,
  source/root/category paths, selected href, item count, capped item list, and model-backed
  `openItem()` / `openCategory()` / `refresh()` signatures. An empty attached directory is `items:
  []`; detached/no-provider state is `undefined`.
- `git-tree-editor.d.ts`: `IGitCommitSnapshot`, `IGitFileChangeSnapshot`, `IGitRefSnapshot`,
  `IGitTreeEditor`, copied repository/ref/change/commit state, current selection, bounded commit
  projection, `loadMore()`, `refresh()`, `openChange()`, and `revealRef()`. No checkout, stage,
  commit, pull, push, or fetch facade method.
- `page-panels.d.ts`: add `IPagePanelNode`, the four current-task panel interfaces, and the
  deferred generic panel-node shape. Existing `IPagePanel`, `IPagePanels.items`, `isOpen`, `width`,
  `expand()`, and `toggleSidebar()` declarations are unchanged. New panel getters return a node
  when the panel is present and `undefined` otherwise.

Update `src/renderer/api/types/page.d.ts` to import the two new declarations and add
`"category-view"` and `"git-tree"` to `IFacadeEditorId` and `IEditorFacade`; do not alter the
`IPage.panels` property name or existing members. This follows the completed env-vars and archive
declarations and makes the dedicated facades narrowable in the public API.

All public arrays and nested records are snapshots. Folder item results copy every `ILink` field
that is returned; Git commit/ref/change results copy every public field and never expose a live
submodel array. For Git, `GIT_TREE_PAGE` is 200 (`src/renderer/components/git-tree/GitTreeModel.ts:22`):
the facade reports `loadedCommitCount` and `hasMore`, returns at most the first 200 loaded commits,
and exposes model-backed `loadMore()` for another bounded page. It never dumps an unbounded
history into the agent context. The resolver's general array cap is an additional safety net, not
the contract's primary bound.

### 2. Implement and register the Folder View facade

Create `src/renderer/scripting/api-wrapper/FolderViewEditorFacade.ts` and add it to
`src/renderer/scripting/api-wrapper/PageWrapper.ts:52-70` and its private facade union. The
descriptor uses `pageScopeSelector()` and `activatePageAndWaitForLayout()` from
`src/renderer/scripting/ai-vision/page-elements.ts:6-35`, preserves `id`/`name`, and declares the
single curated `category-breadcrumb` element. No `highlightOptions.all` is required for this
singleton, but use the option if the implementation declares any repeated item control later.

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `category-editor-root` | Omit | Structural Folder View root; `CategoryEditor.ts:95`. |
| `category-search-host` | Omit | Search host/container rather than a navigation control; `CategoryEditor.ts:180`. |
| `category-breadcrumb` | Curate | Shows the current category and supports model-backed category navigation; `CategoryEditor.ts:209`. |
| `category-toolbar` | Omit | Structural toolbar host; `CategoryEditor.ts:264`. |

The facade state is model-backed:

| Getter | Source and absent behavior |
| --- | --- |
| `providerType` / `providerName` | Resolved provider on the attached page; `undefined` without a page, valid link, matching provider, or provider. |
| `sourceUrl` | Provider `sourceUrl`; `undefined` without a resolved provider. |
| `rootPath` | Provider `rootPath`; `undefined` without a resolved provider. |
| `categoryPath` | `CategoryEditorModel.categoryPath`; `undefined` when detached or the link is invalid. A real root category is `""` only when attached and valid. |
| `selectedHref` | Owning provider host's `selectionState.selectedHref`, mapped from its internal `null` sentinel to `undefined`; `undefined` without a provider/host or selection. |
| `items` | Fresh snapshots from `provider.list(categoryPath)`; `[]` for an attached valid empty directory; `undefined` without a page/provider. I/O errors remain errors. |
| `itemCount` | Count of the current copied listing; `0` for a real attached empty directory, `undefined` without a listing/provider. |
| `viewMode` | The effective mode from `folderViewModeService.getViewModeSync(categoryPath)` when attached and resolved; `undefined` without a resolved page/provider. Do not expose the view's private mode cache as a live object. |

Add model methods to `CategoryEditorModel.ts` for provider-host resolution, copied listing,
selection, item/category navigation, and a safe refresh. Move the existing code paths rather than
reimplementing them:

This is a move, not a second implementation. The existing Folder View provider ownership,
provider-backed listing, `findTreeProviderHost()`, `handleSelect()`, `handleNavigate()`, and
`handleBreadcrumbChange()` bodies move into `CategoryEditorModel.ts`; `CategoryEditor.ts` keeps only
the presentation wiring and every existing UI callback calls the moved model method. The facade
calls those same model methods. No provider/listing/opening branch may remain in the view beside the
model method, including the file-versus-directory handling and selection update that US-1321 had
to repair.

- Move `CategoryEditorView.findTreeProviderHost()` (`CategoryEditor.ts:47-66`) into a model-side
  provider-host helper using `page.panelEditors`, `LinkEditor`, `ExplorerEditor`, and `ArchiveEditor`.
- Move `handleSelect()` and `handleNavigate()` (`CategoryEditor.ts:323-338`) into model methods
  that update the same owner `selectionState`, ask the provider for `getNavigationUrl(item)`, and
  send the same `openRawLink` payload with page/source ids. The UI's select and navigate callbacks
  call those model methods after the move.
- Move `handleBreadcrumbChange()` (`CategoryEditor.ts:340-355`) into a model method that uses the
  provider's `getCategorySegments()` and `encodeCategoryLink()`. The view callback becomes a direct
  call to that method.
- Add `listItems()` over the provider's `list()` with copied records. It must not read
  `CategoryViewImpl`, `CategoryViewModel`, or `LinksListView` state.

Before:

```ts
private readonly handleNavigate = (item: ITreeProviderItem): void => {
    this.host?.selectionState.update((state) => { state.selectedHref = item.href; });
    const url = this.host?.treeProvider?.getNavigationUrl(item) ?? item.href;
    void app.events.openRawLink.sendAsync(createLinkData(url, {
        pageId: this.model.id,
        sourceId: this.host?.id,
    }));
};
```

After:

```ts
private readonly handleNavigate = (item: ITreeProviderItem): void => {
    void this.model.openItem(item);
};
```

`openItem()` is the moved handler body in `CategoryEditorModel`; `openCategory()` is likewise the
moved breadcrumb path. The view must not retain a second implementation beside the model method.
No facade action changes the view mode or touches a mounted category view; the mode is element/UI
state only unless a future model-owned setter is proven safe.

### Decision 9: Implement and register the Git Tree facade

Create `src/renderer/scripting/api-wrapper/GitTreeEditorFacade.ts` and add it to
`PageWrapper.ts:52-70`. Its descriptor is page-scoped and passes `highlightOptions: { all: true }`
because `git-tree-pull`/`git-tree-push` may be accompanied by repeated panel controls when the
sidebar is mounted. The main Git Tree element list is:

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `git-tree-editor-root` | Omit | Structural root from `GitTreeEditorView.ts:161`. |
| `git-repo-name` | Omit | Repository label/tag, not an action; `GitTreeEditorView.ts:176,250`. |
| `git-toolbar-divider` | Omit | Layout divider; `GitTreeEditorView.ts:184`. |
| `git-tree-refresh` | Curate | Refresh the model-backed history/status/ref read projection; `GitTreeEditorView.ts:186-191,266-271`. The facade action is `refresh()`. |
| `git-tree-toolbar` | Omit | `PageToolbarView` host; `GitTreeEditorView.ts:235`. |
| `git-tree-bottom-splitter` | Omit | View geometry control; `GitTreeEditorView.ts:325,396`. |
| `git-tree-bottom-panel` | Omit | Structural commit/diff panel root; `GitTreeEditorView.ts:336,406`. |
| `git-tree-bottom-tabs` | Omit | Structural tab-strip host; `GitTreeEditorView.ts:415`. |
| `git-tree-bottom-tab-select` | Curate | Choose the visible Commit or Diff detail tab; `GitTreeEditorView.ts:444-455`, backed by `setBottomPanelTab()`. |
| `git-tree-pull` | Curate as element-only | Locate Pull/Fetch; `GitTreeEditorView.ts:541-568`. It is a Git repository mutation/network operation and has no facade action. |
| `git-tree-push` | Curate as element-only | Locate Push; `GitTreeEditorView.ts:571-588`. It has no facade action. |

The source inventory is corrected here: the epic's nominal count of 30 does not include all four
named controls in `CommitDiffPanel.ts`. The listed Git files contain 33 unique literal UI `name`
values after excluding object-field names such as `name: ref.name`, `name: identity.name`, and
`name: result.name`; the table above covers the 11 names owned by the main editor, the merged panel
table covers 18, and the commit-detail table below covers the remaining four. `GitChangesView` also
constructs the repeated runtime name pattern `git-changes-${label.toLowerCase()}` at line 213;
that pattern is curated separately below and is not counted as another literal name.

#### Commit detail and diff names

These names are nested in the Git Tree's bottom detail surface. They are all structural or
view-owned data hosts, so they are explicitly omitted; commit selection remains model state and
the facade does not reach into either nested view. `CommitInfoPanel.ts` contributes no UIKit
`name` prop in the audited source, so it has no additional row.

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `commit-diff` | Omit | Structural diff panel root; `CommitDiffPanel.ts:87,205`. |
| `commit-diff-files` | Omit | Diff file-list host; `CommitDiffPanel.ts:89,208`. |
| `commit-diff-view` | Omit | Diff renderer host; `CommitDiffPanel.ts:96`. |
| `commit-diff-splitter` | Omit | Nested diff layout control; `CommitDiffPanel.ts:236,250`. |

The facade state and model paths are:

| Getter/action | Model-backed source and absent behavior |
| --- | --- |
| `repoRoot` | `GitTreeEditorState.repoRoot`; `undefined` when detached or the state has no loaded repository, never `""` as absence. |
| `currentRef` | `branches.state.refs.current`; `undefined` for detached/no repository/detached HEAD. Do not substitute `changes.state.branch` unless source review proves it is the same ref value. |
| `commits` / `loadedCommitCount` / `hasMore` | Fresh copies from `gitTree.state.commits`, capped at 200 for the returned list; count is the loaded count, `0` is real for an attached repository with no commits, and all are `undefined` when detached/no repository. |
| `selectedCommitHash` / `selectedCommit` | Move the view-local `selectedHash` into a model-owned selection state and switch `GitTreeEditorView.handleSelectCommit()` and all detail-view props to that state. Both are `undefined` until a commit is selected or when detached. |
| `changes` | Fresh capped copies of staged/unstaged `GitFileChange` records from `GitChangesModel`; empty arrays are real for a loaded clean tree, `undefined` without a loaded repository. |
| `refs` | Fresh copies of `GitBranchesModel.refs` arrays; empty arrays are real for a loaded repository with no refs, `undefined` without a loaded repository. |
| `aheadBehind` | Fresh scalar snapshot from `branches.state.aheadBehind`; real zero counts remain zero; `undefined` without a loaded repository. |
| `refresh()` | Calls the existing visibility-aware `GitTreeEditorModel.refresh()`; it reads/reloads model data and does not queue view work. |
| `loadMore()` | Calls the model's existing bounded loader and returns after one 200-commit page; detached/no repository is a clear unavailable diagnostic, never a silent no-op. |
| `openChange(path, list)` | Validates a copied change snapshot and calls existing `GitTreeEditorModel.openChangeDiff()`; no view access. |
| `revealRef(name, kind)` | Uses existing model `revealRef()` only after a model-side preflight confirms this Git Tree is the page main editor and the ref/tree is available; otherwise throws a clear unavailable diagnostic rather than silently queuing against an unmounted grid. UI ref clicks retain a non-throwing UI-safe path. |

Every facade action has the same preflight rule: a detached editor, absent provider/panel, missing
repository, or unavailable mounted target produces a clear unavailable diagnostic. No action queues
work for a view that is not mounted. A genuinely empty listing or clean repository is not an action
failure.

The model owns the selected-commit state so the facade never reads `GitTreeEditorView`,
`CommitInfoPanelView`, `CommitDiffPanelView`, or their local fields. The detail panels may continue
to fetch their display-specific message/diff data through their existing model/view paths; the
  facade only exposes data that the editor/submodels can answer without a mounted view. Detail
values unavailable from a model-side answer are omitted; the facade stops at `elements` rather
than querying a mounted view, per abort criterion 1.

This is also a move, not a parallel selection store: `GitTreeEditorView`'s existing `selectedHash`
and `handleSelectCommit()` path move to `GitTreeEditorModel`; the view, commit-info props, and
commit-diff props all read the model-owned selection, and the facade reads that same state. No
view-local selected hash or second selection/update branch remains.

Git repository mutation is deliberately excluded. `git-commit`, `git-stage`, `git-unstage`,
`git-tree-pull`, and `git-tree-push` are declared as element-only locations so an agent can see and
point at the controls, but no facade method calls commit, checkout/switch, stage, unstage, fetch,
pull, or push. Existing context-menu and view callbacks remain usable by the user. The blast radius
of agent-driven repository mutation is a separate decision; a demonstrated scenario can reopen it,
but this task does not widen it by accident.

### 4. Add the merged Git panel node

`page.panels.git` is a `PagePanelNode` specialized with the owning `GitTreeEditorModel`. Its state
is copied from `GitTreeEditorModel.changes`, `.branches`, and `.state`:

- `id`, `label`, `ownerEditorId`, and `expanded` come from the live page panel projection;
- `activeTab` is `gitPanelTab ?? "changes"`;
- `branch`, `staged`, `unstaged`, `refs`, and `aheadBehind` are copied model snapshots;
- `fileCount` is the count of distinct changed paths, not an unbounded change dump;
- `openChange(path, list)` and `revealRef(name, kind)` use model methods;
- `refresh()`, `selectTab(tab)`, and `setAlphabetical(value)` use existing model read/presentation
  methods where they do not mutate the repository;
- `close()` uses the existing model/page panel-close path (`GitTreeEditorModel.requestClose()`),
  not a view reference.

The Git panel element curation is:

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `git-panel` | Omit | Structural panel root; `GitPanelSecondaryView.ts:49`. |
| `git-panel-toolbar` | Omit | Structural toolbar host; `GitPanelSecondaryView.ts:63`. |
| `git-panel-tabs` | Curate | Switch Changes/Branches/Tags; `GitPanelSecondaryView.ts:81-103`, backed by `setGitPanelTab()`. |
| `git-branches-sort-alpha` | Curate | Switch historical/alphabetical ref ordering; `GitPanelSecondaryView.ts:93-103,250-257`, backed by `setBranchesAlphabetical()`. |
| `git-panel-header-actions` | Omit | Structural header action host; `GitPanelSecondaryView.ts:106`. |
| `git-panel-refresh` | Curate | Refresh the Git model projections; `GitPanelSecondaryView.ts:113-121`, backed by `refresh()`. |
| `git-panel-close` | Curate | Close the Git panel/editor through the model/page lifecycle; `GitPanelSecondaryView.ts:123-132`. |
| `git-panel-repo-name` | Omit | Repository label/tag, not an action; `GitPanelSecondaryView.ts:137,225`. |
| `git-changes` | Omit | Structural Changes view root; `GitChangesView.ts:57`. |
| `git-changes-unstaged` | Omit | Data-list root; `GitChangesView.ts:80` and repeated grid props at `:213`. |
| `git-changes-staged` | Omit | Data-list/panel root; `GitChangesView.ts:87,375`. |
| `git-changes-toolbar` | Omit | Structural Changes toolbar; `GitChangesView.ts:95`. |
| `git-changes-${label.toLowerCase()}` | Curate as repeated element-only | Runtime per-list control name built at `GitChangesView.ts:213`; locate a visible changed-file row without inventing a row identity. No stage/unstage/commit action is attached. |
| `git-commit` | Curate as element-only | Locate commit; `GitChangesView.ts:319-325`. No agent commit action. |
| `git-stage` | Curate as element-only | Locate stage-selected; `GitChangesView.ts:328-335`. No agent stage action. |
| `git-unstage` | Curate as element-only | Locate unstage-selected; `GitChangesView.ts:339-346`. No agent unstage action. |
| `git-changes-splitter` | Omit | View-local panel geometry; `GitChangesView.ts:356-363`. |
| `git-branches-tree` | Omit | Data-driven ref tree root; `GitRefsView.ts:170`. Ref state is exposed as copied data. |
| `git-tags-tree` | Omit | Data-driven tag tree root; `GitRefsView.ts:170`. |

The panel declares `highlightOptions: { all: true }`: list/row controls may repeat and the overlay
otherwise rings only the first match (`assets/agent/ui-highlight.js:281-286`). Help must state that
`count` is total matching controls and `highlighted` is rings drawn, and that a repeated selector
does not identify a path/change/ref index.

### 5. Add Explorer, Search, and Boards panel state/actions

Extend `ExplorerEditorModel.ts` with model-owned snapshots and navigation operations, then switch
all existing callers in the secondary views to those methods. The operations must be the existing
paths moved, not parallel implementations:

- `listItems()` calls the model-owned `treeProvider.list(rootPath)` and returns fresh item snapshots.
- `openItem(item)` moves `ExplorerSecondaryView.handleItemClick()` (`ExplorerSecondaryView.ts:228-249`),
  including its Git/Mneme category-link special case and `sourceId: "explorer"`.
- `revealItem(href)` increments the existing `revealVersion` only after checking that the page is
  attached, the Explorer panel is present/active, and the provider exists. The view remains the
  consumer of the model command and calls its existing `TreeProviderViewModel.revealItem()` only
  while mounted; the facade never reaches that view model.
- `openSearch(folder?)`, `closeSearch()`, `openBoards()`, and `closeBoards()` remain the model
  lifecycle methods already used by the header controls (`ExplorerSecondaryView.ts:131-171`).
- `openSearchResult(path, lineNumber?)` moves `SearchSecondaryView`'s result-click path
  (`SearchSecondaryView.ts:16-29`) into the model, preserving selection, page id, reveal line, and
  highlight text.
- `openBoard(root)`, `openToolset(root)`, `openGitTree(root)`, and `openMneme(root)` move the
  corresponding existing trailing-button paths (`ExplorerSecondaryView.ts:260-347`) into the
  model. The panel facade exposes only opening/revealing; board creation, deletion, clipboard, and
  trust-removal actions remain element-only or omitted.

The Explorer panel state is `rootPath`, `selectedHref`, provider/list counts, and a capped copied
root listing. Search state is copied from `searchState` (`query`, include/exclude patterns,
searchFolder, result/file counts, and capped result snapshots); it is `undefined` when the Search
panel is not present. Boards state is a copied filtered list from the existing board/tool registries
for the Explorer root plus a model-owned `boardsTab: "boards" | "tools"` value. Move the existing
view-local tab field and its `onChange` caller into `ExplorerEditorModel.setBoardsTab()` before
exposing it; all view reads and updates use that one value. No getter returns a view-owned
`TreeProviderViewModel`, `FileSearchView`, or tree body.

The Explorer/Search/Boards curation table covers the 19 unique literal `name:` values in these
three secondary-view files, plus the four runtime trailing-action names assigned to `name` in
`ExplorerSecondaryView.ts:297,313,322,332`. The epic's count of 19 therefore remains correct for
literal source props; the four runtime names are listed explicitly because they become UIKit
`data-name` values. `explorer-boards` appears once as the Explorer header action and once as the
Boards body root, with separate decisions below. Names such as `name: tool.name` and
`name: toolset.name` are data object fields, not UI `name:` props, and are excluded. The four
collection-level names already exposed by `PagePanelsNode` (`page-nav-panel`,
`secondary-views-container`, `secondary-views-stack`, and `secondary-views-splitter`) remain
unchanged and are not part of this per-panel count.

#### Explorer panel names

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `explorer-secondary-view` | Omit | Structural panel root; `ExplorerSecondaryView.ts:55`. |
| `explorer-header-actions` | Omit | Structural action host; `ExplorerSecondaryView.ts:124`. |
| `explorer-up` | Curate | Navigate the Explorer root upward through `ExplorerEditorModel.navigateUp()`; `ExplorerSecondaryView.ts:131-140,414-425`. |
| `explorer-search` | Curate | Open Search for the Explorer root; `ExplorerSecondaryView.ts:141-149`. |
| `explorer-boards` | Curate | Open Boards for the Explorer root; `ExplorerSecondaryView.ts:151-159`. |
| `explorer-collapse-all` | Curate as element-only | Locate collapse-all, but its handler is the view-owned `TreeProviderViewModel.collapseAll()` (`ExplorerSecondaryView.ts:161-169`); no facade action queues it. |
| `explorer-close` | Curate | Close the sidebar through page state; `ExplorerSecondaryView.ts:171-179`. The node action uses the page/model lifecycle. |
| `explorer-open-board` | Curate as repeated | Open a board manifest's board; assigned at `ExplorerSecondaryView.ts:297` and rendered by `:348-365`; highlight all matching trailing buttons and use model `openBoard()`. |
| `explorer-open-toolset` | Curate as repeated | Open a trusted/registered toolset; assigned at `ExplorerSecondaryView.ts:313` and rendered by `:348-365`; highlight all and use model `openToolset()`. |
| `explorer-open-git` | Curate as repeated | Open the repository's Git Tree; assigned at `ExplorerSecondaryView.ts:322` and rendered by `:348-365`; highlight all and use model `openGitTree()`. |
| `explorer-open-mneme` | Curate as repeated | Open a Mneme root; assigned at `ExplorerSecondaryView.ts:332` and rendered by `:348-365`; highlight all and use model `openMneme()`. |

#### Search panel names

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `search-secondary-view` | Omit | Structural Search panel root; `SearchSecondaryView.ts:57`. |
| `search-secondary-close` | Curate | Close Search through `ExplorerEditorModel.closeSearch()`; `SearchSecondaryView.ts:115-123`. |

#### Boards panel names

| Name | Decision | Purpose and source evidence |
| --- | --- | --- |
| `boards-empty` | Omit | Structural empty-state root; `BoardsSecondaryView.ts:52`. |
| `boards-empty-actions` | Omit | Structural empty-state action host; `BoardsSecondaryView.ts:67`. |
| `boards-create-empty` | Curate as element-only | Locate board creation from the empty state; `BoardsSecondaryView.ts:90-97`. Creation is not a navigation-state facade action. |
| `boards-create-demo-empty` | Curate as element-only | Locate Demo board creation from the empty state; `BoardsSecondaryView.ts:100-107`. No facade creation action. |
| `boards-secondary-view` | Omit | Structural Boards panel root; `BoardsSecondaryView.ts:122`. |
| `boards-tools-switch-bar` | Omit | Structural host for Boards/Tools controls; `BoardsSecondaryView.ts:147`. |
| `boards-close` | Curate | Close Boards through `ExplorerEditorModel.closeBoards()`; `BoardsSecondaryView.ts:193-201`. |
| `boards-tools-switch` | Curate | Switch the model-owned Boards/Tools display; `BoardsSecondaryView.ts:206-220`, backed by `ExplorerEditorModel.setBoardsTab()`. |
| `boards-create` | Curate as element-only | Locate New board and its menu; `BoardsSecondaryView.ts:223-236`. Creation remains outside this read-mostly facade. |
| `explorer-boards` | Omit | Data-driven Boards tree root; `BoardsSecondaryView.ts:302-310`. The Explorer header's same name is curated above. |
| `explorer-tools` | Omit | Data-driven Tools tree root; `BoardsSecondaryView.ts:316-324`. |

Every panel descriptor that declares a repeated trailing/list control passes
`highlightOptions: { all: true }`. The help for each repeated declaration says that `visible` means
at least one matching mounted row and that `count`/`highlighted` describe total matches/rings, not
an item identity. The facade actions accept explicit paths/ids and never infer one from a selector.

### 6. Add the generic panel node and deferred-panel ledger

Implement the shared node/spec machinery in `src/renderer/scripting/ai-vision/page-panels.ts`.
Each `PagePanelNode` resolves its current owner from `host.panelEditors` and the owner's
`secondaryView` ids at read time. It returns no node for a panel absent from the page and never
creates an Explorer, a lazy `SecondaryViewsModel`, or a secondary view merely because an agent
reads `page.panels.<name>`.

Element scope can use the DOM identity that already exists: `SecondaryViewsView` assigns the
registered panel id as the collapsible panel's `name` (`SecondaryViewsView.ts:183-193`), and
`CollapsiblePanelStackView` renders that as `data-type="collapsible-panel"` plus `data-name`
(`CollapsiblePanelStackView.ts:172-181`). A panel node therefore scopes its `createElements`
selectors to this page and this panel root; it does not add a second DOM registry. Duplicate bare
ids use `highlightOptions: { all: true }` and expose every owner through `items`.

Current-task panel specs provide state, actions, help, and `elements` for:

- `explorer`: `ExplorerSecondaryView.ts` names above;
- `search`: `SearchSecondaryView.ts` names above;
- `boards`: `BoardsSecondaryView.ts` names above;
- `git`: `GitPanelSecondaryView.ts`, `GitChangesView.ts`, and `GitRefsView.ts` names above.

Deferred cross-reference panels still get generic addressable nodes with `id`, `label`, owner,
expanded state, `state` metadata, and `elements: []`; `close` is included only where the owner
already has a safe model/page path. They receive no invented panel-specific state or action:

| Name | Decision | Source-backed reason |
| --- | --- | --- |
| `notebook-categories-secondary-view` | Omit from this task's panel elements | Generic `page.panels.notebookCategories` node only; panel-specific curation was deferred by US-1319 (`NotebookCategoriesSecondaryView.ts:24`). |
| `notebook-categories-tree` | Omit from this task's panel elements | Generic node only; data-tree body remains with the Notebook task (`NotebookCategoriesSecondaryView.ts:108`). |
| `notebook-tags-secondary-view` | Omit from this task's panel elements | Generic `page.panels.notebookTags` node only; panel-specific curation was deferred by US-1319 (`NotebookTagsSecondaryView.ts:22`). |
| `notebook-tags-list` | Omit from this task's panel elements | Generic node only; data-list body remains with the Notebook task (`NotebookTagsSecondaryView.ts:102`). |
| `rest-secondary-view` | Omit from this task's panel elements | Generic `page.panels.rest` node only; REST panel curation remains with US-1320 (`RestPanelSecondaryView.ts:28`). |
| `rest-panel-pane` | Omit from this task's panel elements | Generic node only; structural REST pane remains with US-1320 (`RestPanelSecondaryView.ts:42`). |
| `rest-client-tree` | Omit from this task's panel elements | Generic node only; REST tree body remains with US-1320 (`RestRequestTreeView.ts:97`). |
| `rest-tree-add` | Omit from this task's panel elements | Generic node only; REST tree mutation control remains with US-1320 (`RestRequestTreeView.ts:67`). |
| `rest-tree-root-label` | Omit from this task's panel elements | Generic node only; REST tree label remains with US-1320 (`RestRequestTreeView.ts:53`). |
| `archive-secondary-view` | Omit from this task's panel elements | Generic `page.panels.archive` node only; panel-specific curation was deferred by US-1321 (`ArchiveSecondaryView.ts:25`). |
| `archive-secondary-close` | Omit from this task's panel elements | Generic node only; Archive close action remains with US-1321 (`ArchiveSecondaryView.ts:43`). |
| `git-diff-revisions` | Omit from this task's panel elements | Generic `page.panels.fileHistory` node only; this is separate from merged Git (`GitDiffRevisionsSecondaryView.ts:33`). |
| `git-diff-revisions-refresh` | Omit from this task's panel elements | Generic node only; File History refresh remains with its owning task (`GitDiffRevisionsSecondaryView.ts:58`). |
| `git-diff-revisions-tree` | Omit from this task's panel elements | Generic node only; File History tree body remains with its owning task (`GitDiffRevisionsSecondaryView.ts:156`). |

This explicitly chooses "nodes for all listed cross-reference panels, current-task elements for only
Explorer/Search/Boards/Git." No panel is silently left with a dangling reference, and no deferred
panel receives a speculative action that would reach into a view. Existing arbitrary registered
panel ids remain visible in `items` and exact-id `index()` access even when they have only the
generic node.

#### Absent-value audit for the panel contract

The implementation must preserve the old collection wire contract while making every new
panel getter explicit about absence. `EditorModel.page` is `IPageHost | null`
(`src/renderer/editors/base/EditorModel.ts:67`), so a detached owner is distinct from a present
panel whose data is empty.

| Getter or projection | Absent result | Real empty/zero result |
| --- | --- | --- |
| `page.panels.items` | `[]` when there is no attached page, preserving the existing member contract. | `[]` when an attached page contributes no registered panels. |
| `page.panels.isOpen` | `false` before the lazy sidebar model exists, preserving the existing member contract. | `false` is also a real closed-sidebar value once the model exists. |
| `page.panels.width` | `null` before the lazy sidebar model exists, preserving the existing legacy contract only. | A numeric width when the model exists; new panel getters never reuse this sentinel. |
| `page.panels.<knownPanel>` / exact indexed child | No child (`undefined`) for a known panel absent from this page; exact indexing lets the existing resolver report `No item ...`. | A node object whenever the live page projection contributes that panel. |
| Panel `id`, `label`, `ownerEditorId`, `expanded`, `state`, `elements` | Not callable because no node exists when the panel is absent. | Present nodes always return their live identity/state; deferred nodes return generic state and `elements: []`. |
| Explorer `rootPath`, `selectedHref`, listing, `itemCount` | `undefined` without an attached owner/provider or when Explorer is absent. | Listing `[]` and count `0` for a real empty root; selection is `undefined` until one exists. |
| Search state/results/counts | `undefined` when Search is absent or its optional search state is not initialized. | `[]` and `0` for an initialized search with no matches. |
| Boards state/list/counts/tab | `undefined` when Boards is absent or its owner has no usable root. | `[]`, `0`, and the model-owned `"boards"`/`"tools"` tab for a present root with no boards/tools. |
| Git panel repository state | `undefined` for a present panel whose model has no loaded repository; detached panel node is still absent if its owner is gone. | Empty changes/refs arrays and zero counts for a loaded clean repository. |

### 7. Audit names at every UIKit update site

Record and follow the UIKit warning: `ButtonView.ts:97-105` and
`src/renderer/uikit/Panel/panel-style.ts:303-331` delete `data-name` when a later `update()` omits
the `name` prop. Any implementation that adds a `name:` or changes a named control must provide
that name at every construction, conditional branch, keyed-row update, and re-render call site.
This task must preserve all existing names and `data-type` values; it must not rename or add a
name merely to make an unsafe view-local action appear model-backed.

### 8. Verification plan (no tests added)

After implementation, perform source review and normal typecheck/lint as appropriate, without
adding unit tests or a test harness. Verify:

- `category-view` and `git-tree` resolve to dedicated facades through `FACADE_FOR_EDITOR`, with
  preserved editor id/name and no content-host assumption;
- `page.panels` retains its old members and dynamically lists only live page-owned panel nodes;
  absent panel properties are `undefined`, exact absent indexes report `No item`, and reading does
  not provision a panel;
- all 4 Folder View names, all 33 literal Git names plus the repeated Git name pattern, and all 19
  literal Explorer/Search/Boards names plus the four runtime trailing names have an explicit
  decision and source reason;
- every repeated declaration uses `highlightOptions: { all: true }`, and help describes
  `count`/`highlighted` honestly;
- every new getter handles detached host, absent panel, no repository, optional value, empty
  directory, clean repository, no refs, detached HEAD, and no selected item without false/zero/
  empty/null stand-ins; genuine empty arrays and zero counts remain real values. The existing
  collection members' documented `isOpen: false` and `width: null` lazy-model contracts remain
  unchanged;
- all returned arrays/objects are copied and Git history is bounded to a count plus 200-item page;
- actions call models/page lifecycle only, never view components, `TreeProviderViewModel`, grids,
  clipboard, menus, or an unmounted queue;
- Git commit/checkout/switch/stage/unstage/fetch/pull/push controls remain element-only with no
  facade mutation action; reopening that decision requires a demonstrated scenario;
- current panel nodes and deferred cross-reference nodes use the correct owner and no content-host
  security claim; `app.fs` remains an independent disk-read path;
- every added `name:` is present at every UIKit `update()` call site.

## Concerns

- **The source counts need a precise interpretation.** The listed Git files contain 33 unique
  literal UI names plus one runtime name pattern; the four `CommitDiffPanel` names are included in
  that literal total. The sidebar files contain 19 unique literal `name:` values plus four runtime
  trailing names. The plan records both totals so a runtime name cannot disappear behind a stale
  source-only count.
- **Panel properties are dynamic.** A panel is page-scoped and can be added, removed, or become
  hidden as the owning editor navigates. `children()` is the live truth; `provide()` and `index()`
  must resolve at call time. A node must not be cached across page or owner changes.
- **Property absence versus wire shaping.** Runtime getters return `undefined` for absent new state.
  The shared result shaper may serialize an unresolved JavaScript `undefined` as JSON `null` at the
  transport edge, but implementation code must not deliberately use `null` as the absence value.
  Existing `page.panels.width === null` is an unchanged legacy collection contract and is not
  reused for any new panel getter.
- **Folder View provider ownership.** The current provider is discovered in the view by scanning
  page panel editors, and `CategoryViewModel` owns a separate loaded listing. The facade must use a
  model/provider listing and copy it; it must not report the view's potentially stale or unmounted
  arrays.
- **Git selection ownership.** Selected commit, commit-detail, and diff-file state are currently
  split between the editor view and nested views. Move only the selection needed by the facade into
  the editor model; if a detail value cannot be answered model-side, omit it rather than querying a
  mounted view.
- **Read-mostly is not mutation permission.** Repository mutation has a large blast radius. The
  named Git mutation controls remain visible element locations, but no facade method invokes them.
  Pull/fetch also have network effects and stay out of scope.
- **Reveal timing.** Explorer reveal uses an existing model counter consumed by a mounted view, and
  Git reveal depends on a mounted main-editor grid. Facade actions must preflight presence/visibility
  and throw a clear diagnostic when the target view is unavailable; UI callbacks may keep their
  existing non-throwing guards.
- **Deferred panel inventories.** Notebook, REST, Archive, and File History nodes are created by the
  generic mechanism so prior task references are live, but their panel-specific `elements` and
  richer state should be filled by the owning task scope rather than guessed here.
- **UIKit name persistence.** Omitting `name` from a later `update()` deletes `data-name`; review
  every update call site before changing any view props.
- **No security guarantee.** None of the three surfaces has a content-host boundary, and omitting
  bytes/credentials from a facade does not prevent `app.fs` or another permitted path from reading
  disk. No member accepts a secret value.

## Acceptance Criteria

- [ ] The task implementation is limited to the files in the planned scope; no unit tests,
      harnesses, dashboard changes, generated-asset hand edits, user-doc changes, or commits occur.
- [ ] `pages[i].editor` returns a dedicated Folder View facade for `category-view` and a dedicated
      Git Tree facade for `git-tree`, registered in `FACADE_FOR_EDITOR`, with preserved id/name.
- [ ] `page.panels` keeps `items`, `isOpen`, `width`, `expand`, and `toggleSidebar` unchanged and
      adds dynamic live nodes for Explorer, Search, Boards, merged Git, Notebook Categories/Tags,
      REST, Archive, File History, and exact arbitrary registered panel ids.
- [ ] Present panel nodes resolve through the owning model; absent known properties return
      `undefined`, absent exact indexed ids report the existing no-item diagnostic, and reads never
      create a panel or lazy sidebar model.
- [ ] All four Folder View names have Curate/Omit decisions; only `category-breadcrumb` is curated
      in the editor facade, and Folder View state/listing/navigation is model-backed.
- [ ] All 33 literal Git UI names plus the repeated Git name pattern, and all 19 literal
      Explorer/Search/Boards UI names plus the four runtime trailing names, have explicit
      curation decisions and source-backed reasons in this plan; repeated declarations use
      `highlightOptions: { all: true }`.
- [ ] Folder View, Git Tree, and current-task panel help documents page scoping, repeated-control
      `count` versus `highlighted`, and the fact that repeated selectors do not identify a row.
- [ ] Folder View returns real `[]` for an attached empty directory; Git returns real empty arrays
      for a clean/no-ref repository; all new detached/no-provider/no-repository/absent-panel/
      optional values return `undefined`, with no false/zero/empty/null absence markers. The
      existing `page.panels.isOpen`/`width` lazy-model contracts remain unchanged.
- [ ] All arrays and nested records are copied. Git exposes a loaded count plus a capped 200-commit
      page and a bounded `loadMore()` path rather than an unbounded history dump.
- [ ] Existing view handlers moved into models have all callers switched to the moved path; the
      Folder View UI and facade use the same model provider/listing/selection/open/category methods,
      and Git UI selection/detail plumbing and facade reads use the same model-owned selection.
      No second implementation remains beside a moved handler, and no facade action reaches into a
      view, mounted grid/tree model, clipboard, menu, or unmounted queue.
- [ ] `git-commit`, `git-stage`, `git-unstage`, `git-tree-pull`, and `git-tree-push` are visible as
      element-only controls but no facade action performs commit, checkout/switch, stage, unstage,
      fetch, pull, or push. The separate mutation decision is recorded for future reopening.
- [ ] US-1319's notebook panel references, US-1320's five REST panel references, and US-1321's two
      archive panel references resolve to explicit `page.panels` nodes; no cross-reference silently
      remains unowned. Current-task `elements` are filled only for Explorer/Search/Boards/Git.
- [ ] The implementation reviews every new UIKit `name:` at every construction/update/re-render
      call site and preserves all existing `data-name`/`data-type` values.

## Files Changed

| File | Planned change |
| --- | --- |
| `doc/tasks/US-1323-navigation-surfaces/README.md` | This source-verified plan, panel-node design, curation tables, absent-value audit, action/security decisions, concerns, acceptance criteria, and file scope. |
| `src/renderer/scripting/api-wrapper/FolderViewEditorFacade.ts` | New page-scoped Folder View facade with copied provider/item state and model-backed category/item navigation. |
| `src/renderer/scripting/api-wrapper/GitTreeEditorFacade.ts` | New page-scoped Git Tree facade with copied bounded history/status/ref state, refresh/load/reveal/open actions, and no repository mutation methods. |
| `src/renderer/scripting/api-wrapper/PageWrapper.ts` | Register the Folder View and Git Tree facades in the existing union/map. |
| `src/renderer/scripting/ai-vision/page-panels.ts` | Add cheap, side-effect-free live panel child enumeration and alias/index resolution, plus specialized current-task and generic deferred nodes, while preserving existing collection members. |
| `src/renderer/api/types/folder-view-editor.d.ts` | New self-contained public Folder View snapshots and action declarations. |
| `src/renderer/api/types/git-tree-editor.d.ts` | New self-contained public Git Tree snapshots, bounded listing, and read-mostly action declarations. |
| `src/renderer/api/types/page-panels.d.ts` | Add panel-node interfaces/aliases without changing existing collection member contracts. |
| `src/renderer/api/types/page.d.ts` | Import the two new editor declarations and add `category-view` and `git-tree` to the public facade id/union types. |
| `src/renderer/editors/category/CategoryEditorModel.ts` | Own provider discovery, copied listing, selection, category/item navigation, and effective view-mode read. |
| `src/renderer/editors/category/CategoryEditor.ts` | Route selection, item navigation, and breadcrumb callbacks through the moved model paths. |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | Own selected-commit state and facade-safe bounded/read/reveal wrappers, preserving existing refresh and diff-open paths. |
| `src/renderer/editors/git-tree/GitTreeEditorView.ts` | Route selected-commit state through the model and preserve names at every update site. |
| `src/renderer/editors/explorer/ExplorerEditorModel.ts` | Own copied Explorer/Search/Boards navigation paths moved from secondary views and safe reveal preflight. |
| `src/renderer/editors/explorer/ExplorerSecondaryView.ts` | Route item/trailing navigation through Explorer model methods; retain view-only tree collapse/reveal consumption. |
| `src/renderer/editors/explorer/SearchSecondaryView.ts` | Route search-result opening through the Explorer model path. |
| `src/renderer/editors/explorer/BoardsSecondaryView.ts` | Route board/toolset opening through the model-owned methods moved from the existing handlers. |

Files intentionally needing **no changes**:

- `src/renderer/editors/register-editors.ts`, `src/renderer/editors/category/index.ts`, and
  `src/renderer/editors/git-tree/index.ts` - registrations, no-content-host defaults, and link
  decoding already prove the topology; no new editor id or loader is needed.
- `src/renderer/editors/category/FolderViewModeService.ts` - existing effective-mode persistence
  service is reused; no new mode store is introduced.
- `src/renderer/components/tree-provider/CategoryViewModel.ts`, `CategoryViewImpl.ts`,
  `TreeProviderViewModel.ts`, and `src/renderer/components/git-tree/GitTreeModel.ts` - existing
  listing/grid models remain view/component-owned; facades consume copied model answers and do not
  alter generic components. The selected-commit handoff is confined to
  `GitTreeEditorModel.ts`/`GitTreeEditorView.ts`.
- `src/renderer/components/git-tree/GitChangesModel.ts`, `GitBranchesModel.ts`, and
  `src/renderer/api/git.ts` - existing read/mutation submodel boundaries are reused; no Git service
  mutation API is widened.
- `src/renderer/editors/git-tree/GitChangesView.ts`, `GitRefsView.ts`, `GitPanelSecondaryView.ts`,
  `CommitInfoPanel.ts`, and `CommitDiffPanel.ts` - their existing named controls and model-backed
  callbacks remain; no facade action queries them. Selected-commit prop plumbing is updated only at
  the `GitTreeEditorView.ts` caller, not by adding a second detail implementation.
- `src/renderer/editors/explorer/page-explorer.ts` - page-scoped provisioning is already correct;
  the panel node reads its result and does not replace provisioning.
- `src/renderer/ui/secondary-views/SecondaryViewsView.ts` and
  `src/renderer/uikit/CollapsiblePanelStack/CollapsiblePanelStackView.ts` - existing panel ids are
  already rendered as per-panel `data-name` scope, so no second DOM identity mechanism is needed.
- `src/renderer/editors/notebook/panels/**`, `src/renderer/editors/rest-client/panels/**`,
  `src/renderer/editors/archive/ArchiveSecondaryView.ts`, and
  `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.ts` - deferred panel nodes use
  generic ownership only; their panel-specific inventories/actions remain with the owning tasks.
- `src/shared/ai-vision/types.ts`, `src/shared/ai-vision/resolver.ts`,
  `src/shared/ai-vision/help-search.ts`, and `src/renderer/scripting/ai-vision/elements.ts` - the
  existing children/index/provide and copied-result machinery is sufficient.
- `assets/agent/ui-highlight.js`, UIKit primitive files, and `src/renderer/uikit/Panel/panel-style.ts`
  - overlay behavior and delete-on-omitted-name contract are reused, not modified.
- `assets/editor-types/**`, `vite.renderer.config.ts`, `doc/active-work.md`, and
  `doc/epics/EPIC-087.md` - generated declarations are refreshed only by the normal generation
  path, and the dashboard/epic entry already exists; the user explicitly said not to change it.
- `docs/**`, unit tests, test harnesses, release notes, and commits - explicitly out of scope.
