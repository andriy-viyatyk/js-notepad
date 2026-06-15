# US-674 — Mneme tree editing (create / rename / delete files & folders)

**Status:** Implemented (unreviewed) — 2026-06-15. Server + renderer done; `cargo build --release` +
`cargo test` (29 mcp incl. 6 new) + `tsc` + `eslint` all clean. Server tool surface **live-verified
over MCP on TestWiki** (mkdir / move-file / rename-folder / extension-rename / conflict-refused /
recursive-delete — all OK). Stays `[ ]` on the dashboard per the epic deferred-review model
(`/review` + `/document` run at epic close; Rust skips `/review` & `/userdoc`).
**Epic:** [EPIC-032 — Mneme](../../epics/EPIC-032.md) · Phase 4. Builds on
[US-663](../US-663-mneme-tree-provider/README.md) (read-only tree) and
[US-685](../US-685-mneme-filesystem-navigability/README.md) (file tools see the whole root like a
filesystem).

## Goal

Add write operations to the read-only Mneme tree panel: **New File**, **New Folder**, **Rename**,
**Delete**, and **drag-and-drop move** — for both files and folders — directly in the `mneme-tree`
secondary view, behaving like the Explorer (`FileTreeProvider`) tree.

## Background

### The renderer UI is already built (the easy half)

The generic tree component already implements the entire editing UX; a provider only has to declare
`writable = true` and implement the optional `ITreeProvider` mutation methods. Nothing new is needed
in the tree component.

- **Contract** — `src/renderer/api/types/io.tree.d.ts`: `writable: boolean` (required gate) plus
  optional methods `mkdir(path)`, `rename(oldPath, newPath)`, `addItem(item)`, `deleteItem(href)`,
  `updateItem`, `moveToCategory`, `renameCategoryPath`, `deleteItems`, and a duck-typed
  `watch(callback)`.
- **Reference impl** — `src/renderer/content/tree-providers/FileTreeProvider.ts` (`writable = true`):
  `addItem` = write empty file, `mkdir` = `mkdirSync({recursive})`, `rename` = `renameSync` (covers
  rename **and** move), `deleteItem` = stat→`rmSync({recursive})` for dirs / `unlinkSync` for files,
  `watch` = `fs.watch`.
- **UI wiring** — `src/renderer/components/tree-provider/TreeProviderViewModel.tsx`: builds the
  context menus (New File / New Folder on folders + background; Rename / Delete on files & non-root
  folders), the modal rename (`ui.input`), the delete confirmation (`ui.confirm`), and DnD move
  (`moveItems` → `provider.rename` for single items, with a `ui.confirm`). Every mutation handler
  ends with `await this.buildTree()`. `subscribeWatch()` duck-types `provider.watch` and calls
  `buildTree()` on each signal.
- **Current Mneme tree** — `src/renderer/content/tree-providers/MnemeTreeProvider.ts` is read-only
  (`writable = false`, no mutation methods). Mounted by
  `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx` via `<TreeProviderView>`; built in
  `src/renderer/editors/mneme-root/MnemeRootEditorModel.ts` `resolveRoot()`.
  `MnemeTreeSecondaryView` currently bumps a `refreshKey` on `mnemeConnection.onListChanged` — but
  `refreshKey` is a **dead prop** (the view-model never reacts to it), so the tree does not actually
  live-refresh today. Switching to `provider.watch()` fixes that for free.

### The mneme server is the real work (the hard half)

Findings from `mneme/` (Rust):

- **Folders are implicit.** No directory records exist anywhere. `tree`
  (`mneme/src/mcp/mod.rs`) synthesizes folder nodes purely from file paths; `walk_root`/`walk_all`
  (`mneme/src/store/walk.rs`) skip non-file entries. **An empty folder is invisible** to `tree` and
  `glob`, and a folder vanishes from output the moment its last file is removed (the OS dir lingers
  on disk but is never listed).
- **Mutation primitives** (`mneme/src/store/mod.rs`): `write`, `write_bytes`, `edit`,
  `delete` (`std::fs::remove_file` — **per-file only**, fails on a directory). There is **no**
  `rename`, `move`, `mkdir`, or `remove_dir` helper, and **no** `rename`/`move`/`mkdir` MCP tool.
- **Path safety is reusable** — `WikiAddress::parse`/`resolve` (`mneme/src/store/address.rs`) reject
  `..` and `.mneme/` and clamp inside the root; any new store fn taking an `addr: &str` gets this for
  free. (Note: `resolve` only canonicalizes when the path exists, which is correct for a not-yet-
  created `mkdir` target.)
- **Live refresh is already wired.** The watcher fan-out (US-670) emits
  `notifications/resources/list_changed` on `Create` / `Remove` / `Modify(Name)` and
  `resources/updated` per URI; broadcasts reach any session that has called `list_resources`. So
  **no new notification plumbing is needed** — a subscribed UI tree learns of every create / delete /
  rename automatically.

## Approach (locked)

Treat the Mneme tree as a **filesystem view** — consistent with US-685 (file tools already see the
whole root like a filesystem) and US-686/687. Show real directories (including empty ones) and add
the small set of server tools the UI needs. **Two new MCP tools** (`mkdir`, `rename`) + **one
existing tool made directory-aware** (`delete`) + a directory-aware `tree` on the server; one
writable provider + one view cleanup on the renderer.

**Index consistency comes from the existing reconcile, not new plumbing.** Both reconcile paths drop
index rows for any path no longer present on disk (`reconcile_root` mneme/src/indexer/mod.rs:185,
`reconcile_job` :282). So every mutation just performs the OS-level change and triggers a **scoped
reconcile** of the affected root/subtree — stale rows are removed and new files added automatically.
No `delete_by_prefix` / `rename_prefix` index functions are needed (Decision 3).

### Part A — mneme server (Rust)

All paths under `mneme/`. **Rust task** — `/review` & `/userdoc` do not apply; verify with
`cargo build --release` + `cargo test`.

1. **Directory-aware `tree`** — `mneme/src/mcp/mod.rs` tree handler. After building file-derived
   nodes, add a directory scan so **empty folders are listed** (and a folder created by `mkdir`
   shows immediately). Add a `walk_dirs` helper in `mneme/src/store/walk.rs` (mirrors `walk_all`
   but yields directory entries, honoring the same `.mneme/`/ignore skips). Merge dir nodes with the
   file-derived nodes (dedupe). **`glob`/`grep`/`search` stay file-only** — only `tree` becomes
   directory-aware. Add a test that an empty dir appears in `tree` and not in `glob`.

2. **`mkdir` — store fn + MCP tool.**
   - `mneme/src/store/mod.rs`: `pub fn mkdir(&self, addr: &str) -> Result<()>` → `create_dir_all(self.resolve(addr)?)`.
   - `mneme/src/mcp/mod.rs`: `ServerState::mkdir`; `mneme/src/mcp/server.rs`: `mkdir { path }` tool
     (≈ no native analogue; "create an empty folder"). No index work.

3. **`rename` — store fn + MCP tool (covers file rename, file move, folder rename, folder move
   within one root; also extension change — Decision 5/6/8).**
   - `mneme/src/store/mod.rs`: `pub fn rename(&self, from: &str, to: &str) -> Result<()>` →
     resolve both, `create_dir_all(to.parent())`, reject if `to` exists, `std::fs::rename` (handles
     both files and directories at the OS level).
   - Index: after the rename, trigger a **scoped reconcile** of the affected root. The reconcile drops
     the now-absent `from` rows and indexes the `to` files; an extension change to a non-indexed type
     (e.g. `.md`→`.txt`) is handled for free — `from` drops out, `to` isn't re-added (Decision 8).
     (Optional optimization for the single-file same-ext case: targeted `delete_document(from_rel)` +
     `single_doc_index(to_rel)` instead of a full scoped reconcile — only if profiling warrants it.)
   - `server.rs`: `rename { from, to }` tool (≈ move/rename); document that it also moves and renames
     folders.

4. **`delete` made directory-aware (Decision 4) — single path delete, file or folder.** Add store
   `pub fn delete_path(&self, addr: &str) -> Result<()>`: stat the resolved path → directory ⇒
   `std::fs::remove_dir_all`, else `std::fs::remove_file`. The **existing `delete` MCP tool** uses it:
   for a file, keep today's behavior (`delete_path` + `writer().delete_document(rel)`); for a
   directory, `delete_path` (recursive) + a **scoped reconcile** to drop all rows under the subtree
   (Decision 3). One tool, both cases — the renderer never has to decide file-vs-folder. Update the
   `delete` tool description to say it removes a file **or a folder (recursive)**.

5. **Docs** — update `mneme/assets/wiki-guide.md`, `mneme/README.md`, and the `INSTRUCTIONS` const
   for the two new tools (`mkdir`, `rename`), the now-recursive `delete`, and the directory-aware
   `tree`. (Agent-facing growth is intentional — mneme is agent-first; Decision 9.)

### Part B — Persephone renderer (TypeScript)

1. **`MnemeTreeProvider` → writable** (`src/renderer/content/tree-providers/MnemeTreeProvider.ts`):
   - `writable = true`.
   - `addItem(item)` → `callTool({ name: "write", arguments: { path: item.href, content: "" } })`
     (existing tool). New files default to a `.md` name.
   - `mkdir(path)` → new `mkdir` tool.
   - `rename(oldPath, newPath)` → new `rename` tool (used by the Rename menu, DnD move, and
     extension change — Decisions 5/6/8).
   - `deleteItem(href)` → always the (now directory-aware) `delete` tool — no file/folder dispatch
     needed in the provider (Decision 4).
   - `watch(callback)` → `mnemeConnection.onListChanged(callback)` so `subscribeWatch()` rebuilds the
     tree automatically.
   - Keep addresses scheme-less `{root}/{path}` (consistent with `list()`/`getNavigationUrl`).
2. **`MnemeTreeSecondaryView.tsx`**: remove the dead `refreshKey`/`onListChanged` workaround (now
   handled by `provider.watch`); confirm `writable` flows so the context menus light up. Optionally
   add a `TreeProviderViewRef` for reveal/collapse.
3. No change required in `MnemeRootEditorModel` for the core surface.

## Concerns / decisions (all resolved 2026-06-15)

1. **Empty-folder model — RESOLVED: (A) filesystem view.** Make `tree` directory-aware (`walk_dirs`)
   + add `mkdir`, so empty folders are real and visible. Matches US-685's direction; best UX.

2. **Server work — RESOLVED: yes, implement the Rust.** US-674 adds new mneme MCP tools (`mkdir`,
   `rename`) + a directory-aware `tree` + a recursive `delete`. This is intended Phase-1-style Rust
   work, not renderer-only.

3. **Folder rename/delete index strategy — RESOLVED: lean on the existing reconcile.** Verified the
   reconcile drops index rows for any path no longer on disk (`reconcile_root` :185 / `reconcile_job`
   :282 iterate `all_doc_paths()` and `delete_document` anything not `present`). So a folder
   rename/delete is just the OS op + a **scoped reconcile** — no `delete_by_prefix` / `rename_prefix`
   plumbing. (Same mechanism that already self-heals a file deleted directly on disk.)

4. **`deleteItem(href)` dir/file flag — RESOLVED: single dir-aware `delete`.** Add store
   `delete_path(addr)` that stats and does `remove_dir_all` (dir) or `remove_file` (file); the
   existing `delete` tool uses it. The provider always calls `delete` — no caching or dispatch.

5. **Atomicity — RESOLVED: separate server `rename` tool.** A single `fs::rename` is atomic and cheap
   vs. a non-atomic renderer `read`+`write`+`delete`. Adds `rename { from, to }`.

6. **DnD move — RESOLVED: use `rename`.** `moveItems` routes single-item moves through
   `provider.rename`. File DnD works once `rename` exists; folder DnD is also wired through `rename`
   (drag a folder node → `rename` its path). (If folder-DnD edge cases surface in testing, they can
   be deferred — not expected to.)

7. **Conflicts / overwrite — RESOLVED.** Server tools reject an existing target (`to`/new path
   exists) and any escape; the renderer surfaces the error via `ui.notify`. No silent overwrite.

8. **New-file extension — RESOLVED: extension rename allowed.** `New File` defaults to `.md`, but
   renaming to any extension is permitted. The reconcile + `include` filter handle indexing: a rename
   to a non-indexed extension drops the file from the index automatically (Decision 3); a rename back
   re-adds it.

9. **Agent-facing surface grows — RESOLVED: by design.** `mkdir`/`rename` and the now-recursive
   `delete` are agent-visible too — mneme is agent-first, so this is a feature (agents can reorganize
   a KB). Reflected in the guide/README/INSTRUCTIONS (Part A.5).

## Acceptance criteria

- [x] Server tools implemented: `mkdir`, `rename` (file/folder/move/extension change), recursive
      `delete`, directory-aware `tree` — all covered by tests (see below).
- [x] Empty folders are visible in the tree (Decision 1 = A) — `mkdir_creates_empty_folder_visible_in_tree`;
      deleting a folder removes its contents and the index rows — `delete_folder_recursively_removes_files_and_index`.
- [x] The tree live-refreshes after each mutation via `provider.watch` (the dead `refreshKey` path is
      removed). *(Wiring verified by `tsc`; live behavior exercised through the generic
      `TreeProviderViewModel.subscribeWatch` path.)*
- [x] Destructive deletes are confirmed (generic `ui.confirm` in `TreeProviderViewModel`); conflicts
      are rejected with an error — `rename_refuses_existing_destination`.
- [x] `cargo build --release` + `cargo test` pass (29 mcp incl. new `mkdir`/`rename`/recursive-`delete`/
      directory-aware-`tree`/extension-rename tests); `tsc --noEmit` + `eslint` clean.
- [x] Guide / README / `INSTRUCTIONS` document the new tools (`mkdir`, `rename`), the recursive
      `delete`, and the directory-aware `tree`.
- [x] Server tool surface live-verified over MCP on TestWiki (2026-06-15): empty-folder in `tree`
      (not `glob`), file move, recursive folder rename, extension-rename drops-from-index,
      conflict refused, recursive folder delete. In-app tree-panel UX accepted by the user.

## Files changed (planned)

| File | Change |
|------|--------|
| `mneme/src/store/walk.rs` | add `walk_dirs` (directory entries) |
| `mneme/src/store/mod.rs` | add `mkdir`, `rename`, `delete_path` (file-or-dir) store fns |
| `mneme/src/mcp/mod.rs` | directory-aware `tree`; `ServerState::{mkdir,rename}`; `delete` made dir-aware (recursive + scoped reconcile) |
| `mneme/src/mcp/server.rs` | new `mkdir` / `rename` tools; `delete` description updated (file or folder) |
| `mneme/src/mcp/params.rs` | params for `mkdir` / `rename` |
| `mneme/assets/wiki-guide.md`, `mneme/README.md`, `INSTRUCTIONS` | document `mkdir`/`rename`, recursive `delete`, directory-aware `tree` |
| `mneme/tests/*` | empty-dir-in-`tree`, `mkdir`/`rename`/recursive-`delete` round-trips, extension-rename drops-from-index |
| `src/renderer/content/tree-providers/MnemeTreeProvider.ts` | `writable = true`; `addItem`/`mkdir`/`rename`/`deleteItem`/`watch` |
| `src/renderer/editors/mneme-root/MnemeTreeSecondaryView.tsx` | drop dead `refreshKey`; rely on `provider.watch` |

### Files that need NO changes

- `src/renderer/components/tree-provider/TreeProviderViewModel.tsx` / `TreeProviderView.tsx` — the
  editing UX (menus, rename dialog, delete confirm, DnD, refresh) already works for any `writable`
  provider.
- `src/renderer/content/tree-providers/FileTreeProvider.ts` — reference only.
- mneme watcher / subscription modules — `list_changed`/`updated` already cover create/delete/rename.
