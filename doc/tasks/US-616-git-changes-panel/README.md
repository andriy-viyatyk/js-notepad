# US-616: Git Tree "Changes" secondary view (status backend + display)

**Epic:** [EPIC-031 — Git Functionality Enhancements](../../epics/EPIC-031.md)
**Status:** ✅ Completed (2026-06-09) — user-tested, `/review` (clean) + `/document` + `/userdoc` done. Per-task completion model for EPIC-031. Stays listed under the epic (moves to epics/completed.md when the epic closes).

## Goal

When the **Git Tree editor** is open, show a **"Changes"** panel in the sidebar split into two parts — **unstaged** changes (top) and **staged** changes (bottom), each a list of changed files. Clicking a file opens its **Git Diff** in the page while the Changes panel stays. **Display-only** this increment — no stage/unstage/discard actions.

This is the first increment of EPIC-031 and establishes two foundations the rest of the epic builds on:
1. A **git status** backend endpoint (staged/unstaged file lists).
2. The **focused-submodel composition** pattern on `GitTreeEditorModel` (mirroring how `BrowserEditor` is split into `webview` / `urlBar` / `bookmarksUI` / `target`).

> The header **"x" close button** (unmount the Git Tree editor; empty the page when it's the main editor) and **persistence/restore** are deliberately **out of scope here** — they are [US-617](../US-617-git-changes-close-lifecycle/README.md). This task only makes the panel *appear, display data, survive navigation, and open diffs*.

## Background — existing code to build on

### Git IPC chain (EPIC-030) — add one endpoint following the exact existing pattern

`gitProbe / gitDetectRepo / gitLog / gitShow` already exist. A new `gitStatus` endpoint slots into the same five touch-points:

| File | Existing reference | Add |
|------|--------------------|-----|
| `src/ipc/git-ipc.ts` | `GitProbeResult`, `GitRepoInfo`, `GitCommit` DTOs | `GitFileChange`, `GitStatusResult` DTOs |
| `src/main/git-service.ts` | `log()` / `show()` (never throw, return empty on failure) | `status(dir)` |
| `src/ipc/main/controller.ts` | `gitShow` handler (l.259) + `bindEndpoint(Endpoint.gitShow, …)` (l.330) | `gitStatus` handler + bind |
| `src/ipc/api-types.ts` | `gitShow = "gitShow"` (l.65) + `[Endpoint.gitShow]: (...) => …` (l.130) | `gitStatus` enum + signature |
| `src/ipc/renderer/api.ts` | `gitShow = async (...)` (l.258) | `gitStatus = async (...)` |
| `src/renderer/api/git.ts` | `show()` (gated on `git.enabled`, `.catch` → "") | `status()` (gated, `.catch` → empty result) |

### simple-git status shape

`simpleGit(dir).status()` returns a `StatusResult` with `files: { path, index, working_dir }[]` plus convenience arrays (`staged`, `modified`, `created`, `deleted`, `renamed`, `not_added`, `conflicted`). `index` is the **staged** (index) status code; `working_dir` is the **unstaged** (working-tree) code. Codes: `M` modified, `A` added, `D` deleted, `R` renamed, `C` copied, `U` unmerged/conflicted, `?` untracked, `' '` (space) = unchanged in that column.

### Secondary view system (Pattern B — mainEditor as secondary)

See [secondary-views.md](../../architecture/secondary-views.md). The Git Tree editor registers **itself** as the owner of a sidebar panel via `this.secondaryView = ["git-changes"]`. The panel component receives the `GitTreeEditorModel` as `model`.

- **Reference two-part panel:** `src/renderer/editors/link-editor/panels/LinkTagsSecondaryView.tsx` — top `Panel` + `Splitter` + bottom `Panel`, portal header via `createPortal(headerContent, headerRef)`. Copy this structure.
- **Registration:** `secondaryViewRegistry.register({ id, label, loadComponent })` in `src/renderer/editors/register-editors.ts`.
- **Survival (this task):** override `beforeNavigateAway` and `onMainEditorChanged` on `GitTreeEditorModel` to **never auto-clear** `secondaryView` — the panel must survive when the user clicks a file and a Git Diff becomes the main editor. (The Archive pattern conditionally survives; here it is *unconditional* — "only manual close", per the user.)

### Submodel composition (the architectural ask)

`BrowserEditor` (`src/renderer/editors/browser/BrowserEditor.ts:49-72`) composes focused submodels, each `new XxxModel(this)` as a `readonly` field. `GitTreeEditorModel` already holds `readonly gitTree = new GitTreeModel()` (commit history). This task adds a **second focused submodel** — `GitChangesModel` (status) — formalizing the pattern so future concerns (branches, tags, stash, …) each become their own submodel rather than bloating `GitTreeEditorModel`.

### Existing model to mirror

`GitTreeModel` (`src/renderer/components/git-tree/GitTreeModel.ts`) is the template for `GitChangesModel`: `TComponentState`, `configure(repoRoot)`, `reload()` (probe + fetch, guarded by a `disposed` flag and a `write()` helper), `dispose()`, gated on `settings.get("git.enabled")`.

### File Diff editor (target of the click action)

`file-diff` editor (`src/renderer/editors/file-diff/`, name "Git Diff") is `hasContentHost: true`, surfaced via the switch widget on a text file whose host has `gitRepo` set. Opening "its Git Diff" from the panel means opening the file in the page and selecting the `file-diff` editor. **Exact mechanism is Concern 1 below** — resolve during implementation deep-dive.

## Implementation plan

### Part A — Git status backend

1. **`src/ipc/git-ipc.ts`** — add DTOs:
   ```ts
   /** One changed file in `git status` (US-616). */
   export interface GitFileChange {
       /** Repo-relative path, forward-slashed. */
       path: string;
       /** Single-letter status code: M A D R C U ? (see git-service). */
       status: string;
       /** Original path for renames/copies (R/C), forward-slashed. */
       oldPath?: string;
   }
   /** Split working-tree status for a repo (US-616). */
   export interface GitStatusResult {
       /** Index (staged) changes. */
       staged: GitFileChange[];
       /** Working-tree (unstaged) changes, incl. untracked ('?'). */
       unstaged: GitFileChange[];
   }
   ```
2. **`src/main/git-service.ts`** — add `status(dir)`. Never throws; returns `{ staged: [], unstaged: [] }` on failure:
   ```ts
   export async function status(dir: string): Promise<GitStatusResult> {
       try {
           const s = await simpleGit(dir).status();
           const staged: GitFileChange[] = [];
           const unstaged: GitFileChange[] = [];
           for (const f of s.files) {
               // index col → staged; working_dir col → unstaged. ' ' = unchanged.
               if (f.index && f.index !== " " && f.index !== "?")
                   staged.push({ path: f.path, status: f.index });
               if (f.working_dir && f.working_dir !== " ")
                   unstaged.push({ path: f.path, status: f.working_dir });
           }
           return { staged, unstaged };
       } catch {
           return { staged: [], unstaged: [] };
       }
   }
   ```
   - Rename handling (`R`): simple-git may encode `path` as `"old -> new"` and populate `s.renamed`. Best-effort for v1 — if `path` contains `" -> "`, split into `oldPath`/`path`. (Refine during impl; deletions/untracked are the common cases and already correct.)
3. **`src/ipc/main/controller.ts`** — add handler after `gitShow` and bind it:
   ```ts
   gitStatus = async (_event: IpcMainEvent, dir: string) => {
       const { status } = await import("../../main/git-service");
       return status(dir);
   };
   // …in registerEndpoints():
   bindEndpoint(Endpoint.gitStatus, controllerInstance.gitStatus);
   ```
4. **`src/ipc/api-types.ts`** — add `gitStatus = "gitStatus",` to the `Endpoint` enum and `[Endpoint.gitStatus]: (dir: string) => Promise<GitStatusResult>;` to the signature map (import `GitStatusResult`).
5. **`src/ipc/renderer/api.ts`** — add `gitStatus = async (dir: string) => executeOnce<GitStatusResult>(Endpoint.gitStatus, dir);` (import `GitStatusResult`).
6. **`src/renderer/api/git.ts`** — add (gated, never throws):
   ```ts
   status(repoRoot: string): Promise<GitStatusResult> {
       if (!settings.get("git.enabled") || !repoRoot)
           return Promise.resolve({ staged: [], unstaged: [] });
       return api.gitStatus(repoRoot).catch(() => ({ staged: [], unstaged: [] }));
   }
   ```

### Part B — `GitChangesModel` submodel

7. **`src/renderer/components/git-tree/GitChangesModel.ts`** (new) — mirror `GitTreeModel`:
   - State: `{ staged: GitFileChange[]; unstaged: GitFileChange[]; loading: boolean; gitOk: boolean }`.
   - `configure(repoRoot)` — store root, reset, mark unloaded.
   - `reload()` — gated on `git.enabled`; `git.probe()` then `git.status(repoRoot)`; `disposed`-guarded `write()`.
   - `dispose()`.
8. **`src/renderer/components/git-tree/index.ts`** (or `.tsx`) — export `GitChangesModel` + its state type alongside `GitTreeModel`.

### Part C — wire the submodel into `GitTreeEditorModel`

9. **`src/renderer/editors/git-tree/GitTreeEditorModel.ts`:**
   - Add `readonly changes = new GitChangesModel();` (the second focused submodel). Add a doc comment noting the composition pattern (cf. `BrowserEditor`).
   - In `initFromRepoRoot()` and `syncGitTree()`, also `this.changes.configure(repoRoot); void this.changes.reload();`.
   - Register the panel: override `setPage(page)` → after `super.setPage(page)`, when `page` is set, `this.secondaryView = ["git-changes"];`.
   - **Always-survive lifecycle (this task):**
     ```ts
     beforeNavigateAway(): void { /* keep secondaryView — only manual close (US-617) */ }
     onMainEditorChanged(): void { /* never remove self */ }
     ```
   - `dispose()` — also `this.changes.dispose();`.

### Part D — the "Changes" panel UI

10. **`src/renderer/editors/git-tree/GitChangesSecondaryView.tsx`** (new):
    - `export default function GitChangesSecondaryView({ model, headerRef })`; type-guard `model instanceof GitTreeEditorModel` (early return before hooks).
    - Layout (cf. `LinkTagsSecondaryView`): outer `Panel direction="column"`; **top** `Panel flex={1}` = unstaged list with a small "Changes" sub-heading; `Splitter orientation="horizontal"`; **bottom** `Panel` = staged list with a "Staged Changes" sub-heading.
    - **Each list reuses `FileList`** (`ui/sidebar/FileList.tsx` — the same component `RecentFileList` wraps). It already provides: **proper file icons** via `FileIcon path={…}` (extension-based, identical to Explorer/Recent), **single-click navigation** (`ListBox onChange`, matching the Explorer/Recent click behavior), built-in search, and context menus. Build `FileListItem[]` from each change (`filePath = fpJoin(repoRoot, change.path)`, `title = fpBasename`), and `onClick` → open the file's Git Diff (Concern 1).
    - **Right-aligned status badge:** extend `FileList` with an optional `getTrailing?: (item: FileListItem) => ReactNode` prop, wired to `ListBox`'s existing per-row **`trailing`** slot (`ListItem` already renders `trailing` right-aligned — `uikit/ListBox/ListItem.tsx:161`). The git-changes panel supplies a small **colored status-letter badge** (M / A / D / R / `?` …). Colors come from `color.ts` (added to all themes if missing). `RecentFileList` passes no `getTrailing`, so it is unaffected.
    - **Reuse vs. extract `FileList` — see Concern 6** (placement decision).
    - **Header (portal):** panel title "Changes" + a **Refresh** `IconButton` (RefreshIcon) → `model.refresh()` (Concern 2). *(No "x" close button yet — US-617.)*
    - **Row click:** call a handler that opens the file's Git Diff (Concern 1).
    - Subscribe to `model.changes.state` via `.use()`.
11. **`src/renderer/editors/register-editors.ts`** — register the panel:
    ```ts
    secondaryViewRegistry.register({
        id: "git-changes",
        label: "Changes",
        loadComponent: async () => {
            const mod = await import("./git-tree/GitChangesSecondaryView");
            return mod.default;
        },
    });
    ```
12. **Colors:** any status-code colors (added=green, modified=amber, deleted=red, …) must come from `color.ts` (+ all theme defs) — no hardcoded colors. Add tokens if missing.

## Concerns / Open questions

1. **How to open a file's "Git Diff" from the panel — ✅ RESOLVED (use `openRawLink`).** Open the file the standard Persephone way: dispatch the link pipeline with `file-diff` as the target and the **current page's id** so it navigates in place:
   ```ts
   const absPath = fpJoin(repoRoot, change.path); // repo-relative → absolute (forward-slashed)
   await app.events.openRawLink.sendAsync(
       createLinkData(absPath, {
           target: "file-diff",
           pageId: this.page.id,        // navigate THIS page (not a new tab)
           sourceId: this.id,           // Git Tree editor id (optional; for future survival logic)
       }),
   );
   ```
   **Verified mechanism:** with `pageId` set, the Layer 3 open-handler (`open-handler.ts:31`) calls `pagesModel.lifecycle.navigatePageTo(pageId, absPath, { target: "file-diff", … })`. `attachEditorToPage` has dedicated `file-diff` handling (`PagesLifecycleModel.ts:132`) — it builds a `FileDiffEditor` that `adoptHost`s the text-file host (which git-detects), exactly like switching to "Git Diff" manually. `pageId` is an ephemeral field (not persisted to `sourceLink`).
   - **Survival is automatic:** replacing the Git Tree main editor with the diff calls `GitTreeEditorModel.beforeNavigateAway()`, which this task makes a no-op → the Git Tree stays in `secondaryViews[]` (the Changes panel persists). `sourceId` is therefore optional here, but passing it is harmless and future-proofs conditional-survival logic.
   - **Deleted files (edge — keep deferred):** a deleted file has no working-tree content, so opening it as a text host may fail to read. The diff itself is valid (`show(HEAD)` vs empty). For this task, the simplest acceptable behavior is to still attempt the open; if it proves problematic, gate the click for `status === "D"` rows or feed an empty working side. Decide during impl — not a blocker for the common M/A/?/staged cases.
2. **Refresh timing — ✅ RESOLVED (manual only; one shared method, two buttons).** No filesystem watching (consistent with EPIC-030 Concern 7). Add a **single unified refresh** on `GitTreeEditorModel` that reloads **both** submodels:
   ```ts
   refresh = (): void => {
       void this.gitTree.reload();
       void this.changes.reload();
   };
   ```
   - **Git Tree toolbar Refresh** (`GitTreeEditorView.tsx`) — change its `onClick` from `model.gitTree.reload()` to `model.refresh()`.
   - **Changes panel header Refresh** — add a Refresh `IconButton` to the panel's portal header calling `model.refresh()`. This keeps refresh available when the main Git Tree editor is hidden (user navigated to a diff and the panel is the only Git Tree surface visible).
   - Both buttons trigger the exact same method — no separate refresh logic.
3. **Untracked files — ✅ RESOLVED (mix into the top/unstaged list; hide ignored).** Match the **Git Extensions** Commit dialog: the **top (unstaged)** list shows all working-tree changes **including brand-new (untracked) files**, with **no separate "untracked" section**; the **bottom** list shows staged files. **Git-ignored** files never appear — simple-git's `status()` omits them by default, so no special handling is needed. Untracked files arrive in the `unstaged` array with status `?` (per the `status()` mapping in Part A); the panel renders them as ordinary unstaged rows. No row cap for v1. (Row visual for the `?` code — e.g. show as `?`/"U"/a new-file glyph — is a minor detail folded into the row-layout decision.)
4. **Empty state — ✅ RESOLVED.** When a list has no files, show a muted **"No changes"** label in that part (both top and bottom use the same label).
5. **Survival vs the panel being shown only for Git Tree — ✅ RESOLVED (unconditional survival; intended design).** Once a Git Diff opens (Git Tree demoted to secondary-only), the Changes panel **persists** so the user can keep clicking files in the lists to review each one — the panel is a persistent "changes browser." Clicking another file while a diff is main **re-navigates the same page** to that file's diff (`openRawLink` with `pageId` = current page replaces the current main editor; the Git Tree stays in `secondaryViews[]` via the no-op `beforeNavigateAway`). The **only** way to remove the Git Tree model is the manual **"x"** close button on the panel header (US-617). During US-616 testing the panel is therefore intentionally "sticky" (no removal path yet).

6. **Reuse vs. extract `FileList` (placement) — ✅ RESOLVED (extract to `components/file-list/`).** `FileList` is **persephone-coupled** (depends on `components/icons/FileIcon` + the trait system + `uikit/ListBox`), so it cannot move to pure `uikit/`; it goes to `components/` (the home for persephone-coupled reusables). Plan:
   - Move `FileList` + `FileListItem` + `FileListRef` from `src/renderer/ui/sidebar/FileList.tsx` → **`src/renderer/components/file-list/FileList.tsx`** (+ `index.ts` re-export). Add a `components/file-list/CLAUDE.md` note? No — the existing `components/CLAUDE.md` already governs the folder; just add `file-list/` to its KEEP list.
   - Update `src/renderer/ui/sidebar/RecentFileList.tsx` (and `ui/sidebar/index.ts` if it re-exports `FileList`) to import from the new location.
   - Add the optional **`getTrailing?: (item: FileListItem) => ReactNode`** prop, wired to `ListBox`'s per-row `trailing` slot. `RecentFileList` passes no `getTrailing` → unchanged behaviorally.
   - The git-changes panel imports `FileList` from `components/file-list/` and supplies the right-aligned status badge via `getTrailing`.

## Implementation notes (as built — incl. fixes beyond the original plan)

Implemented per plan: `gitStatus` backend, `GitChangesModel` submodel, the two-part Changes panel, Pattern B unconditional survival, click → Git Diff, unified `refresh()`, relative-path rows + compact font. Additional changes made during implementation/testing:

- **Latent EPIC-030 bug — empty editor ids accumulated.** `editorRegistry.createEditor` set `s.id` even for an empty `instanceId`, and the restore path assigned `s.id = d.id` even when blank. A falsy id breaks all id-based dedup (`addSecondaryView`), so duplicate git-tree editors piled up (the user's session had 5). Invisible in EPIC-030 (git-tree had no panel); my panel turned them into duplicate React keys → white-screen. **Fixes:** `createEditor` ignores an empty `instanceId`; restore guarantees a non-empty id (`d.id || s.id || crypto.randomUUID()`).
- **`SecondaryViews` defensive dedup.** A duplicate panel id used to crash the whole app (duplicate keys → ref-callback `setState` loop). Now dedup'd in render — a stray duplicate degrades gracefully instead of white-screening.
- **`navigatePageTo` honors explicit content-host targets.** It always replaced `state.editor` with the language preview editor, dropping `target: "file-diff"`. Now an explicit content-host target that differs from `resolveId(path)` (e.g. `file-diff`, never a natural default) wins; normal opens (`target === resolveId`) are unchanged.
- **`GitTreeEditorModel.restore()` (new).** The restore path never called `syncGitTree()`, so the submodels were left unconfigured (empty panels + dead refresh) — latent in EPIC-030 for the history too. `restore()` now syncs both submodels from the persisted `repoRoot`. `refresh()` is also self-healing (configures from `state.repoRoot` before reload).
- **UIKit `ListBox`/`IListBoxItem` gained an optional `trailing` slot** (additive) for the right-aligned status badge.
- **`FileList` extracted** from `ui/sidebar/` to `components/file-list/` (consumers repointed) and given `getTrailing` + `compact` props.

## Acceptance criteria

- Enabling "Git integration" and opening a repo's `.git` node shows the Git Tree editor **with a "Changes" panel** in the sidebar.
- The panel is split: **unstaged** files on top, **staged** files on the bottom, with a draggable splitter; each row shows the file and its status.
- Clicking a file **opens its Git Diff** in the page, and the Changes panel **stays** (Git Tree survives as secondary).
- Refresh updates the lists; empty states render cleanly; git-off / git-missing degrades gracefully (no panel data, no errors).
- No hardcoded colors; no direct `fs`/`path`; backend never throws.
- App compiles and runs; with "Git integration" off, behavior is unchanged.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/ipc/git-ipc.ts` | + `GitFileChange`, `GitStatusResult` DTOs |
| `src/main/git-service.ts` | + `status(dir)` |
| `src/ipc/main/controller.ts` | + `gitStatus` handler + bind |
| `src/ipc/api-types.ts` | + `Endpoint.gitStatus` + signature |
| `src/ipc/renderer/api.ts` | + `gitStatus` wrapper |
| `src/renderer/api/git.ts` | + `status()` (gated, never throws) |
| `src/renderer/components/git-tree/GitChangesModel.ts` | **new** focused submodel |
| `src/renderer/components/git-tree/index.ts(x)` | export `GitChangesModel` |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | + `changes` submodel, panel registration, always-survive lifecycle |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | **new** two-part panel; reuses `FileList`; supplies right-aligned status badges |
| `src/renderer/editors/register-editors.ts` | register `git-changes` panel |
| `FileList` (`ui/sidebar/` → `components/file-list/` per Concern 6) | + optional `getTrailing?(item)` right-aligned slot; possibly relocated (Option A) |
| `src/renderer/ui/sidebar/RecentFileList.tsx` | update import only if `FileList` is relocated (Option A) |
| `src/renderer/theme/color.ts` + themes | status colors (if missing) |

## Files that need NO change

- `GitTreeModel.ts`, `GitTree.tsx`, `BranchTreeCell.tsx`, `swimlane-layout.ts` — history rendering is untouched.
- `file-diff/` editor — reused as-is for the click action (no changes expected; confirm in Concern 1).
- `PageModel.ts` — the empty-page / close mechanic is US-617.
