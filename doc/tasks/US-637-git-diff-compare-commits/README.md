# US-637: File Diff — link metadata for "commits to compare" (smarter defaults + "Open in new Tab")

**Epic:** EPIC-031 — Git Functionality Enhancements (incremental)
**Status:** ✅ Complete — implemented, user-tested, reviewed (`/review` · `/document` · `/userdoc`), and marked `[x]`. `tsc` + `lint` clean.

> **Plan deviation (discovered during implementation):** `openFile` (the new-tab branch) did not honor an explicit content-host `target` — only `navigatePageTo` did (`isExplicitHostTarget`). Without it, "Open in new Tab" would have fallen back to the file's natural editor instead of File Diff. Fixed by mirroring that handling in `openFile` (guarded: only an explicit, non-natural, content-host target; normal opens unaffected — consistent with the "all navigation through the pipeline" principle).
>
> **Follow-up enhancement (user request):** a new-tab File Diff opened with a panel showed the auto-created **Explorer** expanded (the page default is `activePanel = "explorer"`) and the **File History** panel collapsed. Fixed in `openFile` with **no new link field**: when a fresh tab carries a preselected comparison (`diffFrom`/`diffTo` present), it is a File Diff, so expand the editor's **own** first registered panel — `page.expandPanel(adapter.secondaryView?.[0])`. No hardcoded panel id in the core flow; new-tab-only (in-page `navigatePageTo` never does this).
>
> **Follow-up enhancement (user request):** the commit "Diff" panel's changed-file list (`CommitDiffPanel` → `FileList`) gave no selected-row highlight, so you couldn't tell which file the right-hand diff belonged to. Added an opt-in `FileList.selectedPath?: string` prop that forwards to `ListBox` as `isSelected` + `selectionStyle="accent"` (existing UIKit selection support — persistent accent background for browse lists). `CommitDiffPanel` passes `selectedPath={selectedFile}`. Also made **right-click select** the file (its `getContextMenu` calls `setSelectedFile(item.filePath)`), so a right-click both highlights the row and shows its diff, matching a left click. Other `FileList` consumers (Recent) are unaffected (prop omitted).

## Goal

Let a caller pass a **"commits to compare"** pair through the `openRawLink` pipeline so the File Diff editor opens preselected to the desired `from`/`to` revisions instead of always falling back to its `Staged ↔ Unstaged` default. Use this to fix two things and add one feature:

1. **Smarter "Changes" panel default** — clicking a file in the **Staged** list opens `Last commit ↔ Staged` (currently it shows the useless `Staged ↔ Unstaged`, which is identical for a fully-staged file → "no changes"). Clicking in the **Unstaged** list keeps the current `Staged ↔ Unstaged` default.
2. **New feature — "Open in new Tab"** — a right-click context menu on the changed-file list of the Git Tree **"Diff"** bottom panel opens that file in a **new Persephone tab** with a File Diff editor preselected to `Previous commit ↔ selected commit`.

The mechanism mirrors the existing **Search panel → `revealLine`/`highlightText`** pattern: an ephemeral `ILinkData` field set by the caller, forwarded by the open pipeline, and applied to the target editor right after it mounts.

## Background

### The link pipeline already carries ephemeral navigation hints

`ILinkData` (`src/renderer/api/types/io.link-data.d.ts`) has ephemeral fields like `revealLine?` and `highlightText?`. The Explorer **Search** panel sets them:

```ts
// SearchSecondaryView.tsx
app.events.openRawLink.sendAsync(createLinkData(filePath, {
    pageId,
    ...(lineNumber ? { revealLine: lineNumber, highlightText: model.searchState?.query } : undefined),
}));
```

Flow: `open-handler.ts` (`openContent` subscriber) reads `data.revealLine`/`data.highlightText` and forwards them to `pagesModel.lifecycle.navigatePageTo(pageId, …, { revealLine, highlightText, … })`. `navigatePageTo` builds the editor, calls `page.setMainEditor`, then applies the hints to the mounted host (`tfm.revealLine(...)`). The hints are listed in `EPHEMERAL_FIELDS` (`src/shared/link-data.ts`) so they are stripped from the persisted `sourceLink`.

**Gap:** `revealLine`/`highlightText` are only forwarded on the **`navigatePageTo`** branch (when `pageId` is set). The **`openFile`** branch (new tab, no `pageId`) ignores them. The "Open in new Tab" feature uses the new-tab branch, so we must forward the new fields there too.

### File Diff editor — how `from`/`to` are chosen today

`FileDiffEditor` (`src/renderer/editors/file-diff/FileDiffEditor.ts`) holds `from`/`to` of type:

```ts
export type RevSel =
    | { kind: "unstaged" }                                  // working tree (live host content)
    | { kind: "staged" }                                    // index (`:path`)
    | { kind: "head" }                                      // HEAD (`HEAD:path`)
    | { kind: "commit"; hash: string; shortHash: string };  // `<hash>:path`
```

Defaults: `from = staged`, `to = unstaged`. On adopt, `initDiffDefaults()` runs async:
- computes `hasStaged = (index !== HEAD)`;
- **only when `!hasStaged`**, upgrades a still-default `staged`/`head` selection to the file's latest commit (so the label matches the grid).

`FileDiffBodyModel.resolveSide(sel)` resolves each side to text: `unstaged` → live host content; `staged` → `git.show(root, "", relPath)` (index); `head` → `git.show(root, "HEAD", relPath)`; `commit` → `git.show(root, sel.hash, relPath)`. `git.show` returns `""` on any error. **Note:** `git.show(root, "", relPath)` returns the **index**, not empty — so a `commit` selector with an **empty hash** would wrongly resolve to the index; the root-commit case needs an explicit guard (see Concerns).

`initDiffDefaults` is idempotent-ish but can re-run when git detection lands on the restore/open path (a `gitRepo.root` subscription re-invokes `configureForRepo`). Any explicit preselection must therefore be protected from being clobbered by a late `initDiffDefaults` (see plan step 2).

### "Changes" panel — single click opens the diff

`GitChangesSecondaryView.tsx` renders two `ChangesList`s (Unstaged / Staged). **Both** call `model.openChangeDiff(change)` on single click — the list identity is **not** currently passed. `GitTreeEditorModel.openChangeDiff(change)` fires `openRawLink` with `{ target: "file-diff", pageId, sourceId }` (navigate the current page). It dedupes:
- returns early if the file's diff is **already** the page's main editor (`getNavigatorTarget().filePath === absPath`);
- returns early if a navigation to the same path is already in flight (double-click "blink" guard).

That first dedup means clicking the **same** file in the *other* list would currently no-op — so switching `Unstaged → Staged` for one file must be handled by updating the already-open editor's revisions directly (see plan step 4).

### Git Tree "Diff" bottom panel — changed-file list

`CommitDiffPanel.tsx` shows, for the tree-selected commit, a `<FileList>` of changed files (left) + inline Monaco diff (right). It already computes `parent = commit.parents[0] ?? ""` and resolves before/after via `git.show`. `FileList` (`src/renderer/components/file-list/FileList.tsx`) **already supports** a `getContextMenu?: (item) => MenuItem[]` prop (passed straight to `ListBox`) — so adding "Open in new Tab" needs no component change, only a prop.

### Files read during investigation (context)

`FileDiffEditor.ts`, `FileDiffBody.tsx`, `FileDiffBodyModel.ts`, `GitChangesSecondaryView.tsx`, `CommitDiffPanel.tsx`, `GitTreeEditorModel.ts`, `open-handler.ts`, `PagesLifecycleModel.ts`, `io.link-data.d.ts`, `shared/link-data.ts`, `SearchSecondaryView.tsx`, `FileList.tsx`, `api/git.ts` (`show`).

## Implementation plan

### Step 1 — Define the link metadata (single source of truth)

**`src/renderer/api/types/io.link-data.d.ts`** (hand-edit the source; `assets/editor-types/` is a build artifact — never touch it):
- Add a serializable union, structurally identical to `RevSel`:
  ```ts
  /** A single revision selector for the File Diff editor (target === "file-diff"). */
  export type ILinkDiffRevision =
      | { kind: "unstaged" }
      | { kind: "staged" }
      | { kind: "head" }
      | { kind: "commit"; hash: string; shortHash: string };
  ```
- Add two ephemeral fields to `ILinkData` (under "Navigation hints"):
  ```ts
  /** Preselect the File Diff "from" (left) revision. Consumed once on open. */
  diffFrom?: ILinkDiffRevision;
  /** Preselect the File Diff "to" (right) revision. Consumed once on open. */
  diffTo?: ILinkDiffRevision;
  ```

**`src/shared/link-data.ts`** — add `"diffFrom"` and `"diffTo"` to `EPHEMERAL_FIELDS` so they never persist into `sourceLink`.

### Step 2 — FileDiffEditor consumes the metadata

**`src/renderer/editors/file-diff/FileDiffEditor.ts`:**
- Make `RevSel` the single shared type: `export type RevSel = ILinkDiffRevision;` (import the type from `../../../shared/link-data` or the `.d.ts`). Keeps editor + link metadata in lockstep. (`FileDiffBodyModel` imports `RevSel` from here — unchanged.)
- Add a guard field `private _explicitRevs = false;`.
- Add a method:
  ```ts
  /** Apply preselected diff revisions from link metadata (US-637). Marks the
   *  selection explicit so a late initDiffDefaults() won't clobber it. */
  applyDiffRevisions(from?: RevSel, to?: RevSel): void {
      if (!from && !to) return;
      this._explicitRevs = true;
      this.state.update((s) => {
          if (from) s.from = from;
          if (to) s.to = to;
      });
  }
  ```
- In `initDiffDefaults()`, bail before the normalization write when `this._explicitRevs` is set (still resolve/keep `hasStaged` so the pickers render correctly, but do **not** touch `from`/`to`).

**`src/renderer/editors/file-diff/FileDiffBodyModel.ts`:** in `resolveSide`, before the final `commit` branch, add the empty-hash guard so a root commit's (absent) parent resolves to empty rather than the index:
```ts
if (sel.kind === "commit" && !sel.hash) return "";
```

### Step 3 — Forward the metadata through the open pipeline

**`src/renderer/content/open-handler.ts`:** read `data.diffFrom`/`data.diffTo` and pass them into the options of **both** branches — `navigatePageTo(...)` and `openFile(...)`.

**`src/renderer/api/pages/PagesLifecycleModel.ts`:**
- Add `diffFrom?: ILinkDiffRevision; diffTo?: ILinkDiffRevision;` to the `navigatePageTo` options type and the `openFile` options type.
- In `navigatePageTo`, after `await page.setMainEditor(adapter)` (the **fresh-build** path — the `matchesNavigationTarget` reuse path returns earlier and never applies to `file-diff`), if `adapter` exposes `applyDiffRevisions` (duck-type, like the existing `getNavigatorTarget?.`/`matchesNavigationTarget?.` optional-method pattern), call `adapter.applyDiffRevisions(diffFrom, diffTo)`.
- In `openFile` — **leave the existing-page dedupe untouched** (Concern 5). The dedupe early-returns *before* any editor is built, so an already-open file just activates its page and the metadata is naturally dropped. Only in the **fresh-build** branch: capture the adapter (`const adapter = wrap(editor); … this.addPage(adapter);`) and, after `addPage`, call `adapter.applyDiffRevisions?.(diffFrom, diffTo)`. ("Open in new Tab" therefore works only when the file isn't already open.)
- `FileDiffEditor` is already imported here, but prefer the optional-method duck-type over `instanceof` to match the file's existing style and avoid widening coupling.

### Step 4 — "Changes" panel: list-aware default

**`src/renderer/editors/git-tree/GitTreeEditorModel.ts`** — change `openChangeDiff` to take the list kind and choose revisions:
```ts
openChangeDiff(change: GitFileChange, list: "unstaged" | "staged"): void {
    // unstaged list → keep the default (staged ↔ unstaged); staged list →
    // Last commit (HEAD) ↔ Staged (index), so a fully-staged file shows real changes.
    const from: RevSel | undefined = list === "staged" ? { kind: "head" } : undefined;
    const to:   RevSel | undefined = list === "staged" ? { kind: "staged" } : undefined;
    …
}
```
- Compute `absPath` as today.
- Fire `openRawLink` with `{ target: "file-diff", pageId, sourceId, diffFrom: from, diffTo: to }` — **pure link pipeline, no direct method call** (Concern 5). **Keep the existing dedupe early-returns unchanged** (same-file-already-main → no-op; in-flight blink guard). The metadata is consumed only when `navigatePageTo` builds a fresh `FileDiffEditor` on this page.
- **Accepted limitation:** if a file's diff is already the page's main editor, clicking it again (in *either* list) hits the same-file early-return and is a no-op — so it won't re-switch the comparison. The staged-default applies on a fresh open (the common case).
- Import `RevSel` type from `../file-diff/FileDiffEditor` (type-only; verify no import cycle — `FileDiffEditor` imports `GitTreeModel` from `components/git-tree`, not this editor model, so a **type-only** import is safe).

**`src/renderer/editors/git-tree/GitChangesSecondaryView.tsx`** — `ChangesList` needs to know its list kind. Add a `listKind: "unstaged" | "staged"` prop (or reuse the existing `onMove` direction) and pass `model.openChangeDiff(change, listKind)` from `onClick`. The two `<ChangesList>` instances already differ by label; thread `listKind="unstaged"`/`"staged"`.

### Step 5 — Git Tree "Diff" panel: "Open in new Tab"

**`src/renderer/editors/git-tree/CommitDiffPanel.tsx`:**
- Build a `getContextMenu(item)` for the `<FileList>`:
  ```ts
  const getContextMenu = useCallback((item: FileListItem): MenuItem[] => {
      const change = changeMap.get(item.filePath);
      if (!change || !commit) return [];
      return [{
          label: "Open in new Tab",
          icon: <CompareIcon />,
          onClick: () => openInNewTab(change),
      }];
  }, [changeMap, commit, repoRoot]);
  ```
- `openInNewTab(change)` fires `openRawLink` **without** `pageId` (→ new tab), target `file-diff`:
  - `absPath = fpJoin(repoRoot, change.path)` (forward-slashed handled downstream);
  - `diffTo = { kind: "commit", hash: commit.hash, shortHash: commit.shortHash }`;
  - `diffFrom = parent ? { kind: "commit", hash: parent, shortHash: parent.slice(0, 7) } : { kind: "commit", hash: "", shortHash: "" }` where `parent = commit.parents[0]` — the empty-hash form resolves to `""` via the step-2 guard (root commit → all additions).
  - `createLinkData(absPath, { target: "file-diff", diffFrom, diffTo })` — **no `pageId`** (new tab) and **no `sourceId`** (Concern 6: `sourceId` is only a sidebar-panel selection-tracking hint; the "Diff" bottom panel isn't one).
- Pass `getContextMenu={getContextMenu}` to `<FileList>`.
- Imports: `createLinkData` (`../../../shared/link-data`), `app` (`../../api/app`), `fpJoin` (`../../core/utils/file-path`), `MenuItem` (`../../uikit/Menu`), `CompareIcon` (`../../theme/icons`).

### Step 6 — verify

- `cd D:\projects\persephone; npx tsc --noEmit` → clean.
- `npm run lint` → clean.

## Files Changed (planned)

| File | Change |
|------|--------|
| `src/renderer/api/types/io.link-data.d.ts` | New `ILinkDiffRevision` union + `diffFrom`/`diffTo` ephemeral fields |
| `src/shared/link-data.ts` | Add `diffFrom`/`diffTo` to `EPHEMERAL_FIELDS` |
| `src/renderer/editors/file-diff/FileDiffEditor.ts` | `RevSel` aliases `ILinkDiffRevision`; `applyDiffRevisions()`; `_explicitRevs` guard in `initDiffDefaults` |
| `src/renderer/editors/file-diff/FileDiffBodyModel.ts` | Empty-hash `commit` → `""` guard (root-commit parent) |
| `src/renderer/content/open-handler.ts` | Forward `diffFrom`/`diffTo` to both `navigatePageTo` and `openFile` |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | Options carry `diffFrom`/`diffTo`; apply via `applyDiffRevisions` (both branches, fresh-build only); `openFile` dedupe **left intact**; `openFile` now honors an explicit content-host target (mirrors `navigatePageTo`'s `isExplicitHostTarget`) so a new-tab `file-diff` open lands on the File Diff editor |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | `openChangeDiff(change, list)` — staged→`head↔staged`; update-in-place when already open |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | Thread `listKind` to `ChangesList`; pass to `openChangeDiff` |
| `src/renderer/editors/git-tree/CommitDiffPanel.tsx` | `getContextMenu` → "Open in new Tab" → `openRawLink` (new tab, commit↔commit); `selectedPath={selectedFile}`; right-click also selects the file |
| `src/renderer/components/file-list/FileList.tsx` | Opt-in `selectedPath?: string` prop → `ListBox` `isSelected` + `selectionStyle="accent"` (persistent selected-row highlight) — follow-up enhancement |

### Files needing NO change
- `FileDiffBody.tsx` — purely renders `fromText`/`toText`; reacts to state automatically.
- `git-service.ts` / `git-ipc.ts` / IPC layers — no new git command (reuses `git.show`).
- `editorRegistry`, `register-editors.ts` — File Diff already registered.
- `ListBox` / `ListItem` — selection (`isSelected`, `selectionStyle="accent"`) already supported; only `FileList` needed to forward it.

## Concerns / Open questions

1. **Root commit (no parent).** ✅ **RESOLVED** — left panel empty ("all additions"). Handled via the empty-hash `commit` selector + the `resolveSide` guard (`!sel.hash → ""`).
2. **Renamed files in "Open in new Tab".** ✅ **RESOLVED** — accepted as a known v1 limitation. `FileDiffEditor` compares a **single** repo-relative path across both revisions (`editor.relPath`), so it does not use `change.oldPath`; the opened tab diffs `path@parent` (empty for the pre-rename path) vs `path@commit`. Full rename support would need per-side paths in `RevSel` (larger change, deferred).
3. **Historical / deleted files.** ✅ **RESOLVED — out of scope.** "Open in new Tab" adopts a `TextFileModel` host at `absPath` for git-repo detection; if the file no longer exists in the working tree, Persephone currently can't open it at all (shows "file not found"). Opening files that are absent from the working tree (so the diff still works from `git.show` commit blobs) is a **separate future task** — not handled here. v1 supports the common case (file still present on disk).
4. **Staged default = `head` vs latest-commit.** ✅ **RESOLVED** — use `from = { kind: "head" }` (simpler, no extra `git log`; renders as "HEAD"/"Last commit").
5. **`openFile` dedupe skip.** ✅ **RESOLVED — do NOT touch the general `openFile` flow.** Link metadata (`diffFrom`/`diffTo`) is consumed **only when a fresh `FileDiffEditor` is constructed** (first open); on any reuse/activate path it is ignored. Consequences:
   - "Open in new Tab" works **only when the file isn't already open**. If it's already open in some page, `openFile`'s existing dedupe just activates that page (showing whatever editor it has — possibly Monaco, not a diff) — we do nothing.
   - The Changes panel stays **pure `openRawLink`** (no direct method call). The same-file list-switch (a file whose diff is already the page's main editor, clicked again in the other list) is an **accepted limitation** — it hits the existing same-file early-return and is a no-op. The staged-default fix applies on a fresh open (the common case).
6. **`sourceId` for the new-tab open.** ✅ **RESOLVED — omit it.** `sourceId` is only a selection-tracking hint for sidebar navigation panels (Explorer, Categories, Archive) — it tells a panel whether a navigated page originated from its selection. The "Diff" bottom panel isn't a sidebar panel, so the new-tab open passes no `sourceId`.

## Acceptance criteria

- [ ] Clicking a file in the **Staged** list opens File Diff as **Last commit (HEAD) ↔ Staged** and shows the staged changes (not an empty `Staged ↔ Unstaged`).
- [ ] Clicking a file in the **Unstaged** list still opens **Staged ↔ Unstaged** (unchanged behavior).
- [ ] *(Accepted limitation, not a requirement)* If a file's diff is already the page's main editor, clicking it again in the other list does **not** re-switch the comparison (same-file early-return no-op).
- [ ] Right-clicking a file in the Git Tree **"Diff"** bottom panel shows **"Open in new Tab"**; choosing it opens a **new tab** with File Diff preselected to **previous commit ↔ selected commit**, matching the inline panel's diff.
- [ ] For a **root-commit** file, "Open in new Tab" shows the file as all-additions (empty left side), not the index.
- [ ] `diffFrom`/`diffTo` never appear in a persisted page `sourceLink` (ephemeral).
- [ ] `npx tsc --noEmit` and `npm run lint` are clean.
</content>
</invoke>
