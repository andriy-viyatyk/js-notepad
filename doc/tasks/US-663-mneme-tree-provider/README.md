# US-663 — MnemeTreeProvider + Explorer-like sidebar panel (open Mneme editor on `.mneme` folder click)

**Status:** Phase 1 + Phase 2 implemented — Rust `cargo build --release` + `cargo test` green; renderer `tsc --noEmit` + `eslint` clean. Awaiting manual smoke test.
**Spans:** Mneme (Rust, `mneme/`) **Phase 1** + Renderer (`src/renderer/`) **Phase 2**.
**Epic:** EPIC-032 (Mneme), Phase 4. Builds on US-661 / US-662 / US-670 / US-673 (shared `mnemeConnection`).

**Two-phase task:** Phase 1 is the Mneme/Rust `wiki_tree` `depth` change (land + verify first); Phase 2 is
the renderer editor + tree panel that consumes it. No separate prereq task — both phases live here.

## Goal

Open a **per-root Mneme editor** when the user clicks a `.mneme` folder in any file tree (exactly like
clicking a `.git` folder opens the Git Tree editor). The editor's **main view is a placeholder** ("Mneme"
label) for now — the search view is a separate, later task. The editor contributes one **secondary-view
sidebar panel**: a **read-only file tree** of the associated Mneme **root**, driven by a new
`MnemeTreeProvider`. The tree's **root node is labeled with the root name** (e.g. `TestWiki`,
`EvergreenWiki`). Clicking a file opens it via `openRawLink("mneme://{root}/{path}")`. The editor follows
the Git Tree "survive navigation, close only via the panel's `x`" lifecycle.

**Multiple roots open at once (required).** Each `.mneme` click for a *different* root creates its own
editor instance and its own panel; re-clicking the *same* root reuses the existing one. Example: clicking
the `.mneme` inside folder A (TestWiki) and then folder B (EvergreenWiki) yields **two** sidebar panels —
`«Mneme icon» TestWiki` and `«Mneme icon» EvergreenWiki` — each with its own file tree.

Out of scope (this task): the search view; any write/create/delete/rename in the tree (it is **read-only**);
multiple roots inside one panel (each root = its own panel).

## Phase 1 — Mneme Rust server: `wiki_tree` `depth` param

**Lazy, per-level tree loading requires a server change.** Today `wiki_tree { path }` returns the **entire
subtree** depth-first: `WikiState::tree()` (`mneme/src/mcp/mod.rs:381`) calls `store.list(path)` (which
enumerates *all* addresses under `path`) and emits every node. For a large wiki (the user plans a future
Azure-backed company wiki — potentially huge and slower than local FS) we must **not** fetch the whole tree
to render one level.

**Required prereq:** add an optional **`depth`** parameter to `wiki_tree` so the client can request a single
level per expand (like `FileTreeProvider` reading one directory at a time):

- `TreeParams` (`mneme/src/mcp/params.rs:124`): add `pub depth: Option<usize>` — "max levels below `path` to
  return; omit for the full subtree (current behavior)".
- `WikiState::tree()` (`mneme/src/mcp/mod.rs:381`): when `depth = Some(d)`, emit only nodes whose **absolute
  depth ≤ (requested-path slash-count) + d** (so `depth:1` ⇒ the path node + its immediate children). Prefer
  pushing the limit into `store.list` so a future remote/Azure backend can enumerate shallowly rather than
  filtering after a full walk. Default `None` keeps today's behavior — backward compatible.
- **Who passes what:** Persephone's `MnemeTreeProvider` always sends **`depth: 1`** (one level per expand —
  the tree view loads children on demand). AI agents calling `wiki_tree` directly may pass a **larger
  `depth`** to pull several levels at once, or **omit** it for the full subtree (current behavior). So
  `depth` serves both consumers: shallow incremental loading for the UI tree, flexible bulk reads for agents.
- Update the `wiki_tree` tool description (`mneme/src/mcp/server.rs:111`) and `mneme/assets/wiki-guide.md`
  to document `depth`.
- Add a test in `mneme/tests/mcp.rs` for `depth:1` returning one level.

Per project rules, Mneme (Rust) work **skips `/review` & `/userdoc`**; verify with `cargo build --release` +
`cargo test`. Land + verify Phase 1 before starting Phase 2.

> Note: the live `depth` field is **absolute** (slash count): `wiki_tree {path:"TestWiki"}` →
> `TestWiki`=0, `TestWiki/log`=1, `TestWiki/log/2026`=2. So immediate children of `path` are entries with
> `depth === path.split("/").length` (i.e. requested-depth + 1). The client filters to that level.

## Background — how the `.git` analogue works (patterns to copy)

### A. Open-on-folder-click + folder icon (`src/renderer/content/tree-providers/FileTreeProvider.ts`)
`list()` tags a `.git` entry with two extra `ILink` fields; `getNavigationUrl()` turns it into a link:
```ts
// list() — lines ~61-69
const isGit = entry.name === ".git" && this.isGitRepoDir(fullPath);
folders.push({ title: entry.name, href: fullPath, category: dirPath, tags: [], isDirectory: true,
    ...(isGit ? { target: "git-tree", icon: "git" } : {}) });
// getNavigationUrl() — lines ~129-136
if (item.target === "git-tree") return encodeGitTreeLink(path.dirname(item.href));
```
Icon substitution — `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx` (~line 23):
```tsx
if (item.icon === "git") return <GitIcon width={16} height={16} />;
```

### B. Virtual link → editor (`git-tree://` scheme)
- `src/renderer/content/git-tree-link.ts` — `GIT_TREE_PREFIX`, `encode/decodeGitTreeLink({ repoRoot })` (base64-JSON).
- `parsers.ts` (~91-98) — Layer-1 `openRawLink` handler recognizes the prefix, sets `data.target ??= "git-tree"`, forwards to `openLink`.
- `resolvers.ts` — the generic **file resolver** sees the `://` virtual path, builds a placeholder pipe, keeps the set `target`, fires `openContent`.
- `open-handler.ts` → `pagesModel.lifecycle.navigatePageTo(pageId, filePath, { target })`.
- `PagesLifecycleModel.ts` `buildEditorById()` switch: `case "git-tree": … newEditorModel(filePath)`.
- `GitTreeEditorView.tsx` `newEditorModel(filePath)` → `decodeGitTreeLink(filePath)` → `model.initFromRepoRoot(repoRoot)`.
- Registered in `register-editors.ts` with `accepts: () => -1` (never extension-matched).

### C. Secondary-view panel (register + declare + header)
- Register: `secondaryViewRegistry.register({ id, label, loadComponent, icon? })`. Omitting `icon` ⇒ host falls back to the owning editor's `getIcon()` glyph.
- Declare on the model: set `this.secondaryView = ["panel-id"]` in `setPage()`.
- Panel props: `SecondaryViewProps = { model, headerRef, icon? }`.
- `SideBarPanelHeader` props: `{ headerRef, icon?, badge?, title, actions? }` — `badge` = a `<Tag>` (Git Tree puts the repo name here); `actions` = the `x` (`CloseIcon` `IconButton`).
- Multiple editors' panels coexist; the accordion key is `${editorId}::${panelId}`, so two Mneme editors give two distinct panels.

### D. "Survive navigation, close only via `x`" lifecycle (`GitTreeEditorModel.ts`)
```ts
setPage(page){ super.setPage(page); if(page && !this.secondaryView?.length) this.secondaryView=["git-branches","git-changes"]; }
beforeNavigateAway(){ /* no-op — survive (base clears secondaryView) */ }
matchesNavigationTarget(target, filePath){ if(target!=="git-tree") return false; const l=decodeGitTreeLink(filePath); return !!l && l.repoRoot===this.state.get().repoRoot; }
async requestClose(){ await this.page?.removeSecondaryView(this); }
```
No-op `beforeNavigateAway` keeps `secondaryView` set ⇒ `PageModel.setMainEditor()` sees `contributesPanels()===true` and does **not** detach/dispose on navigation. Because neither survivor is detached, **multiple** panel-contributing editors accumulate in `page.editors[]` — this is exactly what lets two Mneme roots stay open at once. `matchesNavigationTarget` prevents duplicates per root. The panel `x` → `requestClose()` → `PageModel.removeSecondaryView(this)` → detach + dispose (only that root's editor).

### E. Read-only tree provider + tree view
- `ITreeProvider` (`src/renderer/api/types/io.tree.d.ts`): required = `type`, `displayName`, `sourceUrl`, `rootPath`, `list()`, `stat()`, `resolveLink()`, `getNavigationUrl()`, `getCategorySegments()`, `getNavigationUrlByHref()`; flags `navigable/writable/hasTags/hasHostnames/pinnable`. Read-only ⇒ all flags `false`; skip optional `mkdir/rename/addItem/…`.
- `ILink` node: `{ title, href (unique stable key), category (parent path), tags, isDirectory, hasSubDirectories?, hasItems?, target?, icon? }`.
- Panel renders `<TreeProviderView provider={…} onItemClick={…} selectedHref={…} refreshKey={…} rootLabel={rootName} />`. `TreeProviderView` calls `provider.list(rootPath)` for the root and `provider.list(path)` **lazily on expand**, reconstructing the child path as `node.data.category + "/" + node.data.title`. `rootLabel` overrides the root node's display label.
- Click → open: copy `ArchiveSecondaryView.tsx` / `ExplorerSecondaryView.tsx`:
  ```ts
  const url = provider?.getNavigationUrl(item) ?? item.href;
  app.events.openRawLink.sendAsync(createLinkData(url, { pageId: model.page?.id, sourceId: model.id }));
  ```

### F. Mneme client facts (already in place)
- `mnemeConnection` (`src/renderer/api/mneme-connection.ts`): `getClient()`, `onListChanged(cb)` (already wired; JSDoc names `MnemeTreeProvider` as the consumer), `onStatusChange(cb)`.
- `mneme://{root}/{path}` already opens documents (parser → resolver → `MnemeProvider` reads via MCP `resources/read`). **No new parser/resolver for document links.**
- Tools (verified live): `wiki_list_roots {}` → `{ roots:[{ name, folder }] }`; `wiki_tree { path }` → `{ entries:[{ uri:"mneme://{root}/{path}", name, isDir, depth }] }` (per the Dependencies note, gains `depth`).
- **Mneme already has an icon:** `MemoryIcon` + `MEMORY_ICON_COLOR` (`"yellowgreen"`, `src/renderer/theme/palette-colors.ts`). **Reuse it** — no new icon.

## Implementation plan

> Naming (resolved): editor id **`mneme-root`**, module **`src/renderer/editors/mneme-root/`**, secondary
> panel id **`mneme-tree`**. (`mneme-config` remains the separate Phase-5 configuration editor.)

### Phase 1 — `wiki_tree` `depth` param (Mneme/Rust)
See the **Phase 1** section above for the full spec. Land + verify (`cargo build --release` + `cargo test`)
before Phase 2; the tree provider passes `depth: 1`.

### Phase 2 — renderer (editor + tree panel)

#### 1. Virtual link helper — `src/renderer/content/mneme-folder-link.ts` (NEW)
Mirror `git-tree-link.ts`:
- `export const MNEME_FOLDER_PREFIX = "mneme-folder://";`
- `encodeMnemeFolderLink(rootFolder: string): string` — base64-JSON `{ rootFolder }` (the **parent** of the clicked `.mneme` folder = the Mneme root's directory).
- `decodeMnemeFolderLink(raw): { rootFolder: string } | null`.

> Two schemes, kept distinct: **`mneme-folder://`** opens the *editor* for a root (this task);
> **`mneme://`** opens an individual *document* (already works).

#### 2. Folder detection + icon — `FileTreeProvider.ts` + `TreeProviderItemIcon.tsx`
- `FileTreeProvider.list()`, gated on `settings.get("mneme.enabled")`, **name-only** detection:
  ```ts
  const isMneme = mnemeEnabled && entry.name === ".mneme" && entry.isDirectory();
  // …spread when isMneme: { target: "mneme-root", icon: "mneme" }
  ```
- `FileTreeProvider.getNavigationUrl()`: `if (item.target === "mneme-root") return encodeMnemeFolderLink(path.dirname(item.href));`
- `TreeProviderItemIcon.tsx`: `if (item.icon === "mneme") return <MemoryIcon width={16} height={16} color={MEMORY_ICON_COLOR} />;` (import `MemoryIcon` from `theme/icons`, `MEMORY_ICON_COLOR` from `theme/palette-colors`).

#### 3. Parser — `src/renderer/content/parsers.ts`
Layer-1 `openRawLink` handler (copy the `git-tree://` block):
```ts
app.events.openRawLink.subscribe(async (data) => {
    if (!data.href.startsWith(MNEME_FOLDER_PREFIX)) return;
    data.url = data.href; data.target ??= "mneme-root"; data.handled = false;
    await app.events.openLink.sendAsync(data); data.handled = true;
});
```
The generic file resolver handles the `://` virtual path and preserves `target`. **Verify** no new resolver is needed (it isn't for git-tree).

#### 4. Editor wiring — `PagesLifecycleModel.ts` + `register-editors.ts`
- `buildEditorById()`: `case "mneme-root": { const mod = await import("../../editors/mneme-root"); return mod.default.newEditorModel(filePath); }`
- `register-editors.ts`:
  - Editor: `{ id: "mneme-root", accepts: () => -1, loadModule: () => import("./mneme-root") }` (match git-tree's exact registration fields).
  - Secondary view: `secondaryViewRegistry.register({ id: "mneme-tree", label: "Wiki", loadComponent: () => import("./mneme-root/MnemeTreeSecondaryView") });` (omit `icon` → falls back to the editor's `MemoryIcon`).

#### 5. Editor model + view — `src/renderer/editors/mneme-root/` (NEW)
`MnemeRootEditorModel.ts` (extends `EditorModel`):
- State: `{ rootFolder: string; rootName: string; resolving: boolean; error?: string }` (+ base id/title).
- Static `newEditorModel(filePath?)`: construct, `decodeMnemeFolderLink(filePath)` → store `rootFolder`, provisional title = basename(`rootFolder`), then `void resolveRoot()`.
- `resolveRoot()`: `wiki_list_roots` via `mnemeConnection.getClient()`; find root where `normalize(folder) === normalize(rootFolder)` (case-insensitive, slash-normalized — `file-path` util). On hit → set `rootName`, title = `rootName`, build `MnemeTreeProvider(rootName)`. On miss → `error = "Not a registered Mneme root."`; on no client → `error = "Mneme not connected"`. Re-run on `mnemeConnection.onStatusChange("connected")` so a late connection self-resolves (auto-recovery for the sidecar-down case).
- `setPage(page)`: `super.setPage(page); if (page && !this.secondaryView?.length) this.secondaryView = ["mneme-tree"];`
- `beforeNavigateAway()`: no-op (survive navigation).
- `matchesNavigationTarget(target, filePath)`: `target === "mneme-root"` && `decodeMnemeFolderLink(filePath).rootFolder` === `this.state.get().rootFolder` (normalized) → reuse. **Different root ⇒ no match ⇒ new instance ⇒ second panel.**
- `requestClose()`: `await this.page?.removeSecondaryView(this);`
- `getIcon()`: `<MemoryIcon color={MEMORY_ICON_COLOR} />`.
- `dispose()`: unsubscribe `onListChanged`/`onStatusChange`, `treeProvider?.dispose?.()`, `super.dispose()`.
- Expose `treeProvider: MnemeTreeProvider | null`, `rootName`, `rootFolder`, `error`, `resolving` (reactive) for the panel.

Main view (placeholder): centered "Mneme" label (theme colors only). `index.ts`: `export default { newEditorModel }` + the editor-view registration the framework expects (match git-tree's `index.ts`/view wiring).

#### 6. `MnemeTreeProvider` — `src/renderer/content/tree-providers/MnemeTreeProvider.ts` (NEW)
Implements `ITreeProvider`, read-only, per single root:
- `type = "mneme"`, `displayName = rootName`, `sourceUrl = "mneme://" + rootName`, `rootPath = rootName`.
- `navigable = false; writable = false; hasTags = false; hasHostnames = false; pinnable = false`.
- `async list(path)` — **one level only**:
  ```ts
  const client = mnemeConnection.getClient(); if (!client) return [];
  const res = await client.callTool({ name: "wiki_tree", arguments: { path, depth: 1 } });
  const { entries } = parseToolResult<{ entries: TreeEntry[] }>(res);
  const reqDepth = path.split("/").length;            // immediate children = requested-depth + 1
  return entries.filter(e => e.depth === reqDepth).map(e => ({
      title: e.name, href: e.uri /* mneme://… unique */, category: path /* scheme-less parent */,
      tags: e.isDir ? [] : [extOf(e.name)], isDirectory: e.isDir,
  }));
  ```
  (`category + "/" + title` reconstructs the scheme-less `{root}/sub` that `wiki_tree` expects, since both `path` and `category` are scheme-less. `rootPath = rootName`.)
- `getNavigationUrl(item)`: return `item.href` (already a `mneme://{root}/{path}` URL — existing pipeline opens it). Folders don't navigate (`navigable=false`).
- `getNavigationUrlByHref(href)`: return `href`. `resolveLink(path)`: return `path`. `getCategorySegments`: delegate to the shared `relativeCategorySegments` helper.
- `stat(path)`: minimal — only what `TreeProviderView` actually calls (confirm during impl).
- `dispose()`: no-op (connection is shared; never disconnect it).

#### 7. Panel component — `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx` (NEW)
- `export default function MnemeTreeSecondaryView({ model, headerRef, icon }: SecondaryViewProps)` — guard `model instanceof MnemeRootEditorModel`.
- Header:
  ```tsx
  <SideBarPanelHeader headerRef={headerRef} icon={icon}
     badge={<Tag variant="outlined" size="sm" truncate label={rootName} title={rootFolder} />}
     title="Wiki"
     actions={<IconButton name="mneme-tree-close" size="sm" title="Close" icon={<CloseIcon />}
                 onClick={(e) => { e.stopPropagation(); void model.requestClose(); }} />} />
  ```
- Body: `<TreeProviderView provider={treeProvider} rootLabel={rootName} selectedHref={selectedHref} refreshKey={refreshKey} onItemClick={handleItemClick} />`; `handleItemClick` opens files via `openRawLink(getNavigationUrl(item))` (copy `ArchiveSecondaryView.tsx`), folders expand.
- Live-refresh: subscribe `mnemeConnection.onListChanged(() => bump refreshKey)` so external add/remove/rename refreshes the tree (cheap; hook already exists).
- While `resolving` or on `error`, render a centered status line ("Not a registered Mneme root." / "Mneme not connected") instead of the tree.

## Concerns / resolutions (confirmed with user)

1. **Unregistered `.mneme` root** — open the editor anyway; panel shows **"Not a registered Mneme root."** ✅ confirmed.
2. **Detection is name-only** (`entry.name === ".mneme"`, no content probe like `.git`) — ✅ accepted.
3. **Mneme disabled / sidecar down at click** — tree empty + "Mneme not connected"; **self-heals** via `onStatusChange("connected")` → `resolveRoot()` + refresh. ✅ confirmed.
4. **Full-subtree fetch** — ❌ rejected; resolved by **per-level lazy loading** backed by the new `wiki_tree` `depth` param (Dependencies / prereq `US-674`). The provider's `list()` fetches one level per expand.
5. **Path normalization** (`rootFolder` ↔ `root.folder`: backslashes, drive-letter case, trailing slash) — use `file-path` util, case-insensitive compare. ✅
6. **Multiple roots / two editors** — ✅ required and supported: per-root `MnemeRootEditorModel` instances survive navigation and each contributes a distinct `mneme-tree` panel (key `mneme-root-<id>::mneme-tree`); `matchesNavigationTarget` reuses per `rootFolder`. Header badge + tree `rootLabel` both show the root name. Note: only one instance is "main" at a time (its placeholder shows); the others live as panel-only survivors — fine while the main view is a placeholder. *Future:* once the search view lands, decide which root the main view targets.
7. **Naming** — ✅ editor id `mneme-root`, module `editors/mneme-root/`, panel `mneme-tree`.

## Acceptance criteria

- [x] (Phase 1) `wiki_tree { path, depth:1 }` returns only the path node + immediate children; `cargo build --release` + `cargo test` pass. Omitting `depth` is unchanged.
- [ ] A `.mneme` folder shows the **Mneme (MemoryIcon)** icon and, on click, opens a **Mneme editor** whose main view is a "Mneme" placeholder.
- [ ] The editor contributes a **"Wiki"** panel: header = Mneme icon + **root name** badge + close `x`; body = a **read-only** tree whose **root node is labeled with the root name**.
- [ ] The tree lazily lists **one level per expand** (`wiki_tree depth:1`); clicking a **file** opens it via `openRawLink("mneme://{root}/{path}")`; clicking a **folder** expands it. No create/delete/rename affordances.
- [ ] **Two different roots** can be open simultaneously → **two** panels (`«icon» TestWiki`, `«icon» EvergreenWiki`), each its own tree. Re-clicking the same `.mneme` reuses its instance.
- [ ] The editor **survives navigation**; disposed **only** via the panel `x` (per root).
- [ ] Unregistered root / Mneme-down shows a clear status message and recovers once connected.
- [x] `tsc --noEmit` and `eslint` are clean.

## Files (planned)

| File | Change |
|------|--------|
| **Phase 1 (Mneme/Rust):** `mneme/src/mcp/params.rs`, `mneme/src/mcp/mod.rs`, `mneme/src/mcp/server.rs`, `mneme/assets/wiki-guide.md`, `mneme/tests/mcp.rs` | add `depth` param to `wiki_tree` (one-level listing) |
| `src/renderer/content/mneme-folder-link.ts` | **NEW** — `mneme-folder://` encode/decode |
| `src/renderer/content/tree-providers/FileTreeProvider.ts` | detect `.mneme` (gated on `mneme.enabled`) → `target:"mneme-root"`, `icon:"mneme"`; `getNavigationUrl` → `encodeMnemeFolderLink` |
| `src/renderer/components/tree-provider/TreeProviderItemIcon.tsx` | `icon === "mneme"` → `<MemoryIcon>` |
| `src/renderer/content/parsers.ts` | Layer-1 `mneme-folder://` handler |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `buildEditorById` → `case "mneme-root"` |
| `src/renderer/editors/register-editors.ts` | register `mneme-root` editor (`accepts: () => -1`) + `mneme-tree` secondary view |
| `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` | **NEW** — model: resolve root, declare panel, survive-nav lifecycle, per-root reuse |
| `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx` | **NEW** — header (icon + root badge + close) + read-only `TreeProviderView` |
| `src/renderer/editors/mneme-root/<main view> + index.ts` | **NEW** — "Mneme" placeholder view + editor module export |
| `src/renderer/content/tree-providers/MnemeTreeProvider.ts` | **NEW** — read-only `ITreeProvider` over `wiki_tree depth:1` |
