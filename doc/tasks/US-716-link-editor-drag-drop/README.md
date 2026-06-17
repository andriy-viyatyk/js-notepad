# US-716: Link editor drag-and-drop improvements

## Goal

Bring the Link editor's **"Collections"** secondary panel up to the same drag-and-drop
capability the Mneme tree panel already has, using the existing trait system:

1. **OS file drop → create link.** Drag file(s) (and folders) from Windows Explorer onto a
   category in "Collections" → a link to each file is created under that category.
2. **Cross-window link drop → add/move into category.** Drag a link from a Link editor open in
   one Persephone window and drop it on a category in another window's Link editor → the link is
   added under that category (or moved, if it already exists).
3. **Dedupe by href → move instead of duplicate.** If a dropped item's `href` already exists in
   the target collection, the existing link is **moved** to the dropped category rather than a
   duplicate being created.
4. **Fix the "unknown root D:" Mneme bug.** Dropping a Link-editor link onto a Mneme panel must:
   *(a)* copy the file into Mneme when the link points to a local file, *(b)* be silently ignored
   when the link is not a local file (e.g. an `http(s)` URL) — no Move dialog, no error toast.

## Background

### The trait system (how Mneme already does this)

DnD is driven entirely by the **trait system** (`doc/architecture/trait-system.md`), not by
"what kind of object is this". A drag *source* publishes a serializable `{ typeId, data }` payload;
a drop *target* resolves the payload's traits and dispatches on **which traits are present + the
source identity**. The relevant trait keys:

- **`LINK`** (`src/renderer/editors/link-editor/linkTraits.ts`) — identity: `getItems(data) → ILink[]`
  and `getSourceId(data) → sourceUrl`. Same `sourceId` as the drop target ⇒ "same source" ⇒ move.
- **`FILE_LINK`** (`src/renderer/core/traits/fileLinkTraits.ts`) — file content:
  `getFiles(data) → IFileLink[]`, where `IFileLink = { name, filePath?, getBytes() }`. Bytes are
  read lazily (`getBytes`), so the payload itself stays small and works cross-window.

A **Mneme node** (`mnemeLinkTraits.ts`) carries **both** `LINK` (for same-root move via `rename`)
and `FILE_LINK` (for cross-root/cross-window copy via download→upload). Its own header comment
already anticipates this task: *"a future http link (LINK + an IFileLink whose getBytes fetches)
drop the same way with no tree changes."*

**OS desktop file drops** are bridged into the trait system by `GlobalEventService.captureDrop`
(capture phase): it resolves each dropped `File` to `{ name, path }` via
`window.electron.getPathForFile`, and attaches an `OsFile` descriptor
(`TraitTypeId.OsFile`, trait set in `fileLinkTraits.ts`) whose `FILE_LINK.getFiles` returns
`IFileLink`s with `filePath` set and `getBytes = fs.readBinary(filePath)`.

### The shared drop routing (where everything is dispatched)

`src/renderer/components/tree-provider/TreeProviderView.tsx` wires the UIKit `<Tree>` DnD props for
**every** tree-provider panel (Mneme, File, Archive, **and Link**). Two callbacks decide drops:

- `canTraitDrop(dropNode, payload)` — lines 166-177.
- `onTraitDrop(dropNode, payload)` — lines 179-200. Current dispatch:
  1. `LINK` present **and** `getSourceId === provider.sourceUrl` → `model.moveItems(items, dropNode)`.
  2. else `FILE_LINK` present → `model.importFiles(getFiles(), dropNode)`.
  3. **else `LINK` present (cross-source fallback) → `model.moveItems(items, dropNode)`.** ← buggy branch.

`acceptsFileDrop` (line 330) is `writable && !!provider.importFiles` — **`LinkTreeProvider` has no
`importFiles`, so OS file drop onto Collections is disabled today.**

### Root cause of the "unknown root D:" bug

`LinkTreeProvider` (`src/renderer/editors/link-editor/LinkTreeProvider.ts`) drags publish
`TraitTypeId.ILink`, whose trait set (`linkTraits.ts`) has **`LINK` only — no `FILE_LINK`**. When such
a link is dropped on a **Mneme** panel:

- Branch 1 skipped (`sourceId` = Link editor's `sourceUrl` ≠ `mneme://{root}`).
- Branch 2 skipped (no `FILE_LINK`).
- **Branch 3 fires** → `model.moveItems(items, dropNode)`.

Inside `TreeProviderViewModel.moveItems` (line 720), Mneme has no `moveToCategory` but **does** have
`rename`, so it takes the **file-provider rename path** (line 748:
`else if (provider.rename && remaining.length === 1)`): it shows the *"Move … to …/"* dialog, then
calls `provider.rename(source.href, …)` with `source.href = "D:\…\file"`. `MnemeTreeProvider.rename`
forwards that verbatim to the MCP `rename` tool, which parses `{root}/{path}`, gets root `"D:"`, and
throws **`MCP error -32603: unknown root D:`**.

**Structural problem:** branch 3 (cross-source LINK fallback) blindly calls `moveItems`, which on a
**file-backed** provider (one with `provider.rename`) feeds an arbitrary external `href` to a
filesystem rename. It is only correct for **catalog** providers (the Link editor), where "move"
means "reassign the `category` field".

### Link editor data model (the catalog target)

- `LinkItem` (`linkTypes.ts`) `extends ILink` with required `id`. `LinkEditorData = { links: LinkItem[], state }`.
  Persisted as JSON via `TextFileModel` (`_host.changeContent`); a state subscription serializes on change.
- `LinkEditor` mutation API (the model *is* the view model):
  - `addLink(link?: Partial<LinkItem>): LinkItem` — line 758 (auto-assigns `category`/`tags` from the
    *selected* category/tag when not supplied; pass an explicit `category` to override).
  - `moveLinkToCategory(linkId, category): void` — line 978.
  - `importLinks(items: ILink[]): Promise<void>` — line 805. **Already** dedupes by lowercased `href`
    (skips duplicates) and **already** recursively scans dropped folders via `scanFolders` (100-file
    confirm gate). Honors per-item `item.category`.
- `LinkTreeProvider` (catalog provider): `writable = true`; implements `moveToCategory(hrefs, targetCategory)`
  (line 158) and `renameCategoryPath(sourcePath, targetCategory)` (line 173); has **no** `rename` and
  **no** `importFiles`.

### What already works (do NOT rebuild)

- **Center drop zone** of the Link editor (`LinkBody.tsx`) already accepts ILink drops and calls
  `importLinks` — cross-window link drop *into the center area* works (dedupe = skip). This task adds
  the same for the **category tree**, with dedupe = **move**.
- `TreeProviderViewModel.importFiles(items, dropNode)` already computes the target category from the
  drop node (`dropNode.data.isDirectory ? dropNode.data.href : dropNode.data.category || rootPath`)
  and calls `provider.importFiles(items, targetCategory)`.
- In-app multi-select drag is **not** supported by the Link editor (one item per drag). So the
  "multiple items" requirement is satisfied entirely by **OS multi-file / folder** drops, which already
  arrive as an `IFileLink[]` array and (for folders) recurse through `importLinks`/`scanFolders`.

## Implementation plan

### Step 1 — Add `FILE_LINK` to the shared `ILink` trait set (so any link/file producer can copy)

**Decision (confirmed):** add `FILE_LINK` to the **shared** `ILink` trait set rather than minting a
dedicated trait type. This is safe with the Step-2 router (a catalog target prefers `LINK`→`importLinks`
over `FILE_LINK`→`importFiles`, so the Link editor's own drops are not mis-routed), and it delivers the
natural enhancement: **Explorer → Mneme** (file copy) and **Explorer → Categories** (link create) work
with no per-producer changes.

1. **`src/renderer/editors/link-editor/linkTraits.ts`** — extend the existing `linkTraits` set
   (currently `LINK` only) with a `FILE_LINK` accessor:
   ```ts
   const linkTraits = new TraitSet()
       .add(LINK, { getItems: …, getSourceId: … })   // unchanged
       .add(FILE_LINK, {
           getFiles: (data) => (data as LinkDragData).items
               .filter((i) => !i.isDirectory && isLocalFileHref(i.href))
               .map((i) => ({
                   name: i.title || fpBasename(i.href),
                   filePath: i.href,
                   getBytes: async () => fs.readBinary(i.href),
               })),
       });
   ```
   Imports needed here: `FILE_LINK` (`core/traits/fileLinkTraits`), `fs` (`api/fs`), `fpBasename`
   (`core/utils/file-path`).
2. **`isLocalFileHref(href)`** — a small local helper: a real on-disk path, i.e. **not** a URL/curl
   and **no** URI scheme. Guard with `isUrlOrCurl` (`content/link-utils.ts`) and `!href.includes("://")`.
   Must classify `http(s)://`, `mneme://`, `curl …`, and archive pseudo-paths as **not** files; plain
   `D:\…` / UNC `\\…` paths as files. (Archive-tree entries are not `fs`-readable — excluding them keeps
   `getBytes` from throwing.)
3. No drag-source, `dragTraitTypeId`, or `LinkBody` changes are needed — every `ILink` producer
   (Link list/tiles, Collections tree, File tree, Archive tree) keeps publishing `TraitTypeId.ILink`
   and now automatically carries `FILE_LINK` for its local-file items. The center drop zone already
   reads the `LINK` trait from `payload.typeId` and is unaffected.

### Step 2 — Capability-driven drop routing (fixes the Mneme bug; enables catalog import)

Rewrite `TreeProviderView.tsx` `onTraitDrop` (lines 179-200) and `canTraitDrop` (166-177) to dispatch
on **target-provider capability**, removing the blanket branch-3 rename fallback.

Add one optional method to the provider contract:

- **`src/renderer/api/types/io.tree.d.ts`** `ITreeProvider` — add
  `importLinks?(items: ILink[], targetCategory: string): Promise<void>;` (catalog upsert; sits beside
  the existing `importFiles?` at line 77).

New `onTraitDrop` logic:
```ts
const linkTrait = traits?.get(LINK);
const fileLink  = traits?.get(FILE_LINK);
const items     = linkTrait?.getItems(payload.data) ?? [];
const sameSource = !!linkTrait && linkTrait.getSourceId?.(payload.data) === provider.sourceUrl;

// 1. Same source → move within the provider (category reassign / file rename).
if (sameSource && items.length) { model.moveItems(items, dropNode); return; }

// 2. Catalog target ingests links directly (Link editor): add-or-move by href.
if (provider.importLinks && linkTrait && items.length) {
    void model.importLinksTo(items, dropNode);   // new VM wrapper, computes targetCategory
    return;
}

// 3. File-backed target ingests file bytes (Mneme): copy files only.
if (provider.importFiles && fileLink) {
    void model.importFiles(fileLink.getFiles(payload.data), dropNode);
    return;
}
// else: ignore — NO rename fallback (this is what fixes "unknown root D:").
```

`canTraitDrop` mirrors the same gating (accept only what a branch above would handle); keep the
existing "single item dropped on its own href" no-op guard for the same-source case. For a file-backed
target, accept a cross-source `LINK` **only if** `fileLink?.getFiles(payload.data).length > 0` (so a
pure `http` link shows no drop affordance and is ignored).

Add the VM wrapper in **`TreeProviderViewModel.tsx`** (next to `importFiles`):
```ts
importLinksTo = async (items: ILink[], dropNode: TreeProviderNode) => {
    const targetCategory = dropNode.data.isDirectory
        ? dropNode.data.href
        : (dropNode.data.category || this.props.provider.rootPath);
    await this.props.provider.importLinks?.(items, targetCategory);
};
```

### Step 3 — `LinkTreeProvider.importFiles` + `importLinks` (the catalog side)

Add both methods to `LinkTreeProvider.ts`; both funnel into the editor's existing `importLinks` with a
new **dedupe = move** option.

1. **`importFiles(items: IFileLink[], targetCategory)`** — convert OS files/folders to `ILink`s and
   delegate. For each `IFileLink` with a `filePath`, `stat` it via `app.fs` to set `isDirectory`
   (so folders recurse through `scanFolders`); skip items without `filePath` (e.g. a Mneme node, which
   has bytes but no path — a Mneme→Link drop is a documented no-op). Build
   `{ title: f.name, href: f.filePath, category: targetCategory, tags: [], isDirectory }` and call the
   editor merge.
2. **`importLinks(items: ILink[], targetCategory)`** — set `category: targetCategory` on each item and
   call the editor merge.
3. Both call a single editor entry point with move-on-duplicate semantics (Step 4).

Once `LinkTreeProvider.importFiles` exists, `TreeProviderView`'s `acceptsFileDrop`
(`writable && !!provider.importFiles`, line 330) auto-enables OS file drop on Collections.

### Step 4 — Dedupe = move (extend `LinkEditor.importLinks`)

Extend `LinkEditor.importLinks` (line 805) with an options arg:
```ts
importLinks = async (items: ILink[], opts?: { moveExistingToCategory?: string }): Promise<void> => { … }
```
- When `opts.moveExistingToCategory` is set: instead of `continue`-ing on a duplicate `href` (line 818),
  look up the existing link by lowercased `href` and `moveLinkToCategory(existing.id, opts.moveExistingToCategory)`.
- Folder scans (`scanFolders`) keep current skip-duplicate behavior (a recursive folder import moving
  existing links around would be surprising); only **top-level dropped** items move.
- Preserve the existing 100-file confirm gate and the "All items already exist" / "Imported N links"
  toasts (treat moved items as handled, not "already exist").

### Step 5 — Docs

- `doc/architecture/trait-system.md` — note the capability-driven drop routing
  (`importLinks` = catalog upsert vs `importFiles` = byte copy; no cross-source rename fallback) and
  that Link-editor drags carry `LINK + FILE_LINK` via `TraitTypeId.LinkItem`.
- Root `CLAUDE.md` Key Files — add `linkItemTraits.ts`.

## Concerns / Open questions

1. **Shared `FILE_LINK` on `ILink` (RESOLVED — shared change chosen).** `FILE_LINK` is added to the
   shared `linkTraits.ts` set, so every `ILink` producer (Link editor, File tree, Archive tree) gains
   file-copy capability. This is intentional — it makes **Explorer → Mneme** (copy) and
   **Explorer → Categories** (link create) work as a natural enhancement. Safe because the Step-2 router
   prefers `LINK`→`importLinks` on catalog targets, so the Link editor's own drops are not mis-routed to
   the byte-copy path.
2. **Removing branch 3 (cross-source LINK rename fallback) is global — clarified.** `TreeProviderView`
   is the single shared drop router for all tree panels (Mneme/File/Archive/Link). Branch 3 today is a
   **no-op** on Link (`moveToCategory` of a foreign href finds nothing) and **buggy/wrong** on
   file-backed targets (`rename` of a foreign href → the `unknown root` bug). Removing it loses nothing
   real and is replaced by working `importLinks`/`importFiles` paths. **Same-source** drops (branch 1)
   are untouched. No provider relies on the removed fallback.
3. **Mneme-node → Link-editor drop** is a no-op (a Mneme node has bytes but no local `filePath`, and its
   `href` is a scheme-less `{root}/{path}` not openable as a link). Documented limitation; tracked as a
   prerequisite by **US-717** (canonical `mneme://` href), which would later make this drop create a
   working `mneme://` link.
4. **Folder drop depth / count.** OS folder drops recurse via the existing `scanFolders` 100-file
   confirm gate — unchanged. `scanFolders` files **every** descendant (subfolders inherit the parent's
   category), so all files land **flat** under `targetCategory` — the folder's internal structure is
   **not** mirrored as sub-categories. (Preserving structure as nested sub-categories would be a
   separate enhancement — see follow-up note.)
5. **Archive-tree → file-backed target.** `isLocalFileHref` filters only URI schemes / curl, so an
   archive-entry href (e.g. `D:\doc.zip!…`) passes as a local file, and `fs.readBinary` reads it via
   the archive service. Dropping an archive entry on Mneme therefore copies the extracted bytes — a
   harmless/useful side effect, not a defect. No special handling needed.

## Acceptance criteria

- [ ] Drag one file from Windows Explorer onto a category in "Collections" → a link to that file is
      created under that category. Multiple files at once → all created. A folder → its files imported
      (honoring the 100-file confirm gate), filed under the dropped category.
- [ ] Drag a link from a Link editor in window A onto a category in a *different* window B's Link editor
      → the link appears under that category in B.
- [ ] If the dropped link's `href` already exists in the target collection, the existing link is **moved**
      to the dropped category — no duplicate is created.
- [ ] Drag a **file** link from the Link editor onto a Mneme panel → the file is copied into Mneme under
      the drop target; no "unknown root" error.
- [ ] Drag a **non-file** link (e.g. `https://…`) from the Link editor onto a Mneme panel → nothing
      happens: no Move dialog, no error toast, no drop affordance.
- [ ] **Natural enhancement:** drag a file from the **Explorer** (File tree) panel onto a Mneme panel →
      file copied in; onto a Collections category → link created. Folders recurse on the Categories side.
- [ ] Same-source DnD within the File/Archive/Mneme trees, and the Link editor center-zone drop, are
      unchanged.
- [ ] `npm run lint` clean; `npx tsc --noEmit` reports no new errors.

## Phasing (optional — commit/stage per phase)

The task splits cleanly into independently-verifiable phases:

- **Phase A — routing + bug fix.** Step 1 (shared `FILE_LINK`) + Step 2 (capability router) + Step 3
  `LinkTreeProvider.importFiles` + Step 4 (dedupe=move). Delivers: OS file/folder drop → Categories,
  Explorer → Mneme/Categories, and the `unknown root` fix. *(`importLinks` provider method can land
  here too, or in Phase B.)*
- **Phase B — cross-window link drop into a category.** `ITreeProvider.importLinks`,
  `LinkTreeProvider.importLinks`, and `TreeProviderViewModel.importLinksTo`. Delivers: dragging a link
  between Link editors in different windows onto a category. *(The center-zone cross-window drop already
  works; this adds the category-tree target.)*
- **Phase C — docs.** Step 5.

Each phase is lint/tsc-clean on its own and can be staged or committed separately.

## Files changed (summary)

| File | Change | Phase |
|------|--------|-------|
| `src/renderer/editors/link-editor/linkTraits.ts` | Add `FILE_LINK` to shared `ILink` set (+ `isLocalFileHref`) | A |
| `src/renderer/editors/link-editor/LinkTreeProvider.ts` | Add `importFiles`; add `importLinks` | A / B |
| `src/renderer/editors/link-editor/LinkEditor.ts` | `importLinks(items, opts?)` — move-on-duplicate option | A |
| `src/renderer/components/tree-provider/TreeProviderView.tsx` | Capability-driven `canTraitDrop` / `onTraitDrop` (remove rename fallback) | A |
| `src/renderer/components/tree-provider/TreeProviderViewModel.tsx` | Add `importLinksTo(items, dropNode)` | B |
| `src/renderer/api/types/io.tree.d.ts` | `ITreeProvider.importLinks?(items, targetCategory)` | B |
| `doc/architecture/trait-system.md`, `CLAUDE.md` | Doc updates | C |

## Files that need NO changes

- `mnemeLinkTraits.ts`, `MnemeTreeProvider.ts` — Mneme is fixed entirely by the routing change; its
  `importFiles` (upload) and `rename` are correct as-is.
- `fileLinkTraits.ts` (`OsFile` producer) — already provides `FILE_LINK` with `filePath` + `getBytes`.
- `GlobalEventService.ts` — OS-file capture bridge already populates the `OsFile` descriptor.
- UIKit `Tree` / `TreeModel` — DnD plumbing is generic and already complete.
