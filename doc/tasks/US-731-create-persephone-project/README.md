# US-731: "Create .persephone project" Explorer context menu (EPIC-034)

## Goal

Add a **"Create .persephone project"** context-menu item on folders in the **Explorer** sidebar panel. Clicking it creates a `.persephone` folder inside the clicked folder (if absent), then reveals + selects the `.persephone` node in the tree so the **Board editor** opens. If `.persephone` already exists, it skips creation and just reveals + selects + opens. **No dialog.**

This is the missing entry point for *creating* a Boards project — today a user can only open a `.persephone` folder they made by hand (the Explorer detects it by name; see US-722).

## Scope

- **In scope:** the folder context-menu item + the create-or-reveal → select → open action.
- **Out of scope:** the "Create demo board" UI (empty-state second button + toolbar `SplitButton` dropdown) and the demo-board template itself. Those ship with **US-728 (Demo board)**, which depends on a demo template (to be built from the `Test` board as prototype). Building that UI now would be dead — it has nothing to scaffold.

## Background

### Discovery already works (US-722)
- `FileTreeProvider` detects a folder literally named `.persephone` by name and tags it `target: "board-view"`, `icon: "board"` (`src/renderer/content/tree-providers/FileTreeProvider.ts:70-82`).
- Its `getNavigationUrl()` returns `encodePersephoneFolderLink(item.href)` for `board-view` items (`FileTreeProvider.ts:151-155`).
- `encodePersephoneFolderLink` / `decodePersephoneFolderLink` live in `src/renderer/content/persephone-folder-link.ts`. The Layer-1 parser routes `persephone-folder://` → Board editor (`src/renderer/content/parsers.ts:115-124`).

So once a `.persephone` node is selected/clicked, opening the Board editor is automatic. This task only needs to **create the folder** and **drive the tree to that node**.

### Context-menu injection point
Custom folder items are injected in `ExplorerSecondaryView.handleContextMenu` via `event.items.push(...)` — exactly how **"Make Root"** and **"Search in Folder"** are added today (`src/renderer/editors/explorer/ExplorerSecondaryView.tsx:67-84`). The handler runs for `item?.isDirectory`. This is the place to add the new item.

### Reveal + select + open chain (all exists)
- `ExplorerEditorModel`: `selectionState` + `setSelectedHref(href)` (selection), and `revealVersion` (a bumpable counter). (`src/renderer/editors/explorer/ExplorerEditorModel.ts`)
- `ExplorerSecondaryView` watches `revealVersion`; on bump it calls `treeProviderRef.current?.revealItem(selectedHref)` (`ExplorerSecondaryView.tsx:44-51`).
- `TreeProviderViewModel.revealItem(href)` computes ancestor dirs, calls `loadChildrenForPaths([rootPath, ...ancestors])` (re-lists the clicked folder → surfaces the new `.persephone`), waits a tick, then expands + scrolls via the UIKit Tree ref (`TreeProviderViewModel.tsx:455-480`).
- `handleItemClick` shows the open pattern: `setSelectedHref` + `app.events.openRawLink.sendAsync(createLinkData(url, { pageId, sourceId: "explorer" }))` (`ExplorerSecondaryView.tsx:55-61`).
- `treeProviderRef.current?.refresh()` is the full re-list used by the Refresh button (`ExplorerSecondaryView.tsx:120-122`).

### Folder creation
- `FileTreeProvider.mkdir(dirPath)` exists (recursive). The view can also use `fs` (`src/renderer/api/fs.ts`) — `fs.exists` + `fs.mkdir`. Use `app.fs` per project convention (no direct `require("fs")`); `fpJoin` from `src/renderer/core/utils/file-path.ts` for the path.

## Implementation plan

All changes are in **`src/renderer/editors/explorer/ExplorerSecondaryView.tsx`** (one file).

1. **Imports** — add:
   - `fs` from `../../api/fs`
   - `fpJoin` from `../../core/utils/file-path` (already imports `fpBasename`, `fpDirname` from there — extend the import)
   - `encodePersephoneFolderLink` from `../../content/persephone-folder-link`
   - `projectTrust` from `../../api/project-trust`
   - `BoardIcon` from `../../theme/icons` (the icon used for `.persephone` / boards)

2. **Action handler** — add a `useCallback`, e.g.:
   ```tsx
   const handleCreateProject = useCallback(async (folderHref: string) => {
       const persephonePath = fpJoin(folderHref, ".persephone");
       try {
           if (!(await fs.exists(persephonePath))) {
               await fs.mkdir(persephonePath);
               // Implicitly trust a project the user just created here (US-721 gate
               // would otherwise show "Boards are not supported in untrusted
               // projects"). ONLY on create — a pre-existing project keeps its state.
               await projectTrust.trust(persephonePath);
           }
       } catch (err) {
           ui.notify(err instanceof Error ? err.message : String(err), "error");
           return;
       }
       // Re-list so the new .persephone node exists, then reveal + select it.
       await treeProviderRef.current?.refresh();
       model.setSelectedHref(persephonePath);
       model.revealVersion.update((s) => { s.version++; });
       // Open the Board editor (mirrors handleItemClick).
       app.events.openRawLink.sendAsync(
           createLinkData(encodePersephoneFolderLink(persephonePath), { pageId, sourceId: "explorer" }),
       );
   }, [model, pageId]);
   ```
   (`ui` import from `../../api/ui` — add if not present.)

3. **Menu item** — in `handleContextMenu`, inside the `item?.isDirectory` block, push:
   ```tsx
   event.items.push({
       label: "Create .persephone project",
       icon: <BoardIcon width={14} height={14} />,
       onClick: () => void handleCreateProject(item.href),
   });
   ```
   Place it sensibly relative to "Make Root" / "Search in Folder" (consider `startGroup` on whichever begins the group). Show it for **all** directory items, including the Explorer root.

4. **Manual verification** (see Acceptance).

No model/provider/parser changes are required — discovery, the link scheme, and the reveal/select/open chain are all in place.

## Concerns / Open questions

- **C-A — Refresh/reveal ordering & staleness (resolved).** If the clicked folder was *already expanded* (children cached without `.persephone`), `revealItem`'s `loadChildrenForPaths` is a no-op for loaded paths (`node.items === undefined` guard) and won't surface the new node. Resolved by `await treeProviderRef.current?.refresh()` (full re-list of root + expanded dirs) **before** bumping `revealVersion`. The ref's `refresh()` was typed `(): void` but is `model.buildTree` (async) — tightened to `(): Promise<void>` so the `await` is sound. (The FS `DirectoryWatcher` also auto-refreshes on mkdir, but that's racy — not relied on.)

- **C-B — Label when `.persephone` already exists (resolved).** Static label **"Create .persephone project"** kept; the action reveals/opens if it already exists (option (a), confirmed with user 2026-06-20). No async existence check at menu-build time.

- **C-C — Nested projects are fine (resolved).** A `.persephone` project is just a place for boards (applications); a user may want one in any folder, including inside another project. **No guard** — the item is offered on every folder unconditionally. (Resolved with user, 2026-06-20.)

- **C-D — Action location (view vs model).** The orchestration touches view-only refs (`treeProviderRef.refresh`), model state (`setSelectedHref`/`revealVersion`), and app events (`openRawLink` + `pageId`) — so it lives in the view as a `useCallback`, consistent with `handleItemClick`/`handleContextMenu`. No new model method needed.

## Acceptance criteria

1. Right-clicking a folder in the Explorer shows **"Create .persephone project"** (for every directory, including the root).
2. On a folder **without** `.persephone`: clicking it creates `<folder>/.persephone`, **auto-trusts the project** (so the Board editor renders directly — no "untrusted project" gate), the Explorer expands the folder, selects the `.persephone` node, and the **Board editor opens** (empty board list).
3. On a folder that **already has** `.persephone`: no error, no duplicate; it reveals + selects the existing node and opens the Board editor. Trust state is **not** changed — an untrusted pre-existing project still shows its trust gate.
4. The selected `.persephone` node stays selected/visible after the FS watcher's auto-refresh tick.
5. `tsc` + `eslint` clean. No dialog appears at any point.

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/editors/explorer/ExplorerSecondaryView.tsx` | Add the "Create .persephone project" folder context-menu item + `handleCreateProject` (create-or-reveal → select → open; auto-trusts the project on create only); new imports (`fs`, `ui`, `fpJoin`, `encodePersephoneFolderLink`, `projectTrust`, `BoardIcon`). |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | Tighten `TreeProviderViewRef.refresh()` return type `void` → `Promise<void>` (it is `model.buildTree`, async) so the create action can `await` the re-list before revealing (C-A). |

## Files — no change expected
`FileTreeProvider.ts`, `persephone-folder-link.ts`, `parsers.ts`, `ExplorerEditorModel.ts`, `TreeProviderViewModel.tsx`, `BoardEditorModel.ts` — discovery, link scheme, reveal/select chain, and Board editor are all already in place.
