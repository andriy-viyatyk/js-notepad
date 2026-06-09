# US-617: Git Tree "Changes" panel — manual close, empty-page, persistence

**Epic:** [EPIC-031 — Git Functionality Enhancements](../../epics/EPIC-031.md)
**Status:** ✅ Completed (2026-06-09) — user-tested; `/review` (clean) + `/document` + `/userdoc` done. Stays listed under EPIC-031 (per-task model; not moved to completed.md).

## Goal

Give the "Changes" panel (built in US-616) its **manual-close lifecycle**:

1. An **"x" close button** in the panel header that **unmounts the Git Tree editor entirely** (the whole `GitTreeEditorModel`, not just the panel).
2. When the user clicks "x" **while the Git Tree editor is the main editor**, it closes **anyway** and the **page becomes empty**.
3. When the user clicks "x" while the Git Tree editor is only a **secondary** view (a Git Diff is the main editor), the Git Tree + panel are removed and the **diff stays** as main.
4. **Persistence/restore** — the panel (and an empty-but-open page, if that state can occur) restore correctly across navigation and app restart.

US-616 made the panel *appear, display, survive navigation, and open diffs* with an **unconditional-survive** lifecycle (no auto-unmount). This task adds the **only** way to remove it: the explicit "x". After this task the feature is complete per the user's description.

## Background — existing code to build on

### PageModel close mechanics (verified 2026-06-09)

`src/renderer/api/pages/PageModel.ts`:
- **`removeSecondaryView(editor)` (l.286) is the whole answer.** It calls `detach(editor)` then `await editor.dispose()`. `detach` (l.229-253) removes the editor from `editors[]`, drops its slice-subscription, calls `editor.setPage(null)`, **and — crucially — clears `_mainEditorId` (→ `state.mainEditorId = null`) when the removed editor was the main** (l.239-242). It also resets `activePanel` to `"explorer"` if it pointed at the closed panel, bumps `version`, and re-runs `_enforceMandatoryOpen`.
  - **Git Tree is main** → `detach` clears `mainEditorId` → the page becomes empty; then `dispose()` runs once.
  - **A Git Diff is main** (Git Tree secondary-only) → `mainEditorId` is untouched → the diff stays as main; only Git Tree is removed + disposed.
- `dispose()` happens **exactly once** (no double-dispose) and there is **no auto-dispose race**: `detach` removes the `secondaryView` slice-subscription *before* disposing, so `onEditorPanelsChanged`'s auto-detach branch (l.315-320) never fires for this editor.
- `setMainEditor` is **not** on `IPageHost` (trimmed — `IPageHost.ts:50-51`), so the model must not call it; `removeSecondaryView` IS on `IPageHost` (l.38) and is the supported path.

**Direct precedent:** `ArchiveSecondaryView.tsx:51` closes its own Pattern B editor with exactly `archiveModel.page?.removeSecondaryView(archiveModel)`. US-617 mirrors this.

So the original `closeEditorCompletely` proposal is unnecessary — `removeSecondaryView` already composes "clear main if main" + "remove + dispose" in one call.

### Empty-page resting state (verified 2026-06-09)

A page with no main editor and no editors is a **supported resting state**: `RenderPageContent` (`src/renderer/ui/app/Pages.tsx:100-105`) renders an `EmptyPageRoot` ornament when `mainEditorInstance` is null; nothing prunes or auto-closes the tab. `PageModel.getDescriptor()` serializes `editors: []` + `mainEditorId: null`, so the empty page persists and restores as a blank tab. This matches the user's intent ("page should become empty") — **no extra code for Concern 2**.

### Close-button pattern in secondary-view headers

[secondary-views.md §5/§11](../../architecture/secondary-views.md): the panel component renders an `IconButton` (CloseIcon) into the portal header. The standard "just hide the panel" handler is `model.secondaryView = undefined`; the standard "remove the whole Pattern B editor" handler is `model.page?.removeSecondaryView(model)` (ArchiveSecondaryView precedent). US-617 uses the latter, via a small `requestClose()` on the model.

### Persistence (Pattern B)

[secondary-views.md §7](../../architecture/secondary-views.md): secondaries persist as `SecondaryModelDescriptor[]`; on restore, a descriptor whose ID matches the `ownerEditor` is **deduplicated** (the existing main-editor instance is reused as the secondary). The Git Tree editor + its `git-changes` panel restore through this path — verify it still works after US-616 registers the panel, and decide what an **empty page** (main closed via "x", restart) should restore to.

## Implementation plan

Only **two files** change — no `PageModel` edit is needed (investigation showed `removeSecondaryView` already does the whole job; see Background).

1. **`GitTreeEditorModel.ts`** — add a small async method `requestClose()`:
   ```ts
   /** Manual close (US-617): the Changes panel "x" removes this whole editor.
    *  `removeSecondaryView` detaches us — clearing the page's main editor when
    *  we ARE the main (→ empty page) and leaving a Git Diff main untouched when
    *  we are only the secondary panel — then disposes us exactly once. */
   async requestClose(): Promise<void> {
       await this.page?.removeSecondaryView(this);
   }
   ```
   (Keeps the view dumb; the model owns the intent. Mirrors `ArchiveSecondaryView`'s close path.)
2. **`GitChangesSecondaryView.tsx`** — add a header **"x"** `IconButton` to the existing `header` fragment (after the Refresh button):
   ```tsx
   import { RefreshIcon, CloseIcon } from "../../theme/icons";
   // …in `header`, after the refresh IconButton:
   <IconButton
       name="git-changes-close"
       size="sm"
       title="Close Git Tree"
       icon={<CloseIcon />}
       onClick={(e) => { e.stopPropagation(); void model.requestClose(); }}
   />
   ```
3. **Confirm only-manual-close still holds.** The US-616 `beforeNavigateAway()` no-op (GitTreeEditorModel.ts:78-80) and the absence of an `onMainEditorChanged` override mean nothing auto-removes the panel; the new "x" is the sole removal path. No change — just re-verify in testing.
4. **No new colors/icons** — reuses the existing `CloseIcon` and `IconButton`.

## Concerns / Open questions — all resolved (2026-06-09)

1. **Exact dispose order (Pattern B). — RESOLVED.** `page.removeSecondaryView(this)` → `detach(this)` (clears `mainEditorId` iff this was main; drops the slice-sub) → `await this.dispose()` once. No `setMainEditor` call (it's not on `IPageHost`). No auto-dispose race (slice-sub removed before dispose). See Background.
2. **Empty-page persistence. — RESOLVED.** Empty page is a supported resting state (`Pages.tsx` `EmptyPageRoot` ornament); it is **not** pruned and persists/restores as a blank tab via `getDescriptor()` (`editors: []`, `mainEditorId: null`). Matches the user's "page becomes empty" intent. No code.
3. **"x" when a Git Diff is main. — RESOLVED.** `detach` only clears `mainEditorId` when the removed editor *is* the main; a diff main is left untouched. The diff stays; only Git Tree + panel go.
4. **Confirm-on-close. — RESOLVED.** Git Tree has `skipSave = true` and is never `modified`, and `removeSecondaryView` does **not** call `confirmRelease` (only `PageModel.close()` does, for modified editors). No spurious prompt.

## Acceptance criteria

- The "Changes" panel header shows an **"x"** button (after the Refresh button).
- Clicking "x" while the **Git Tree editor is the main editor** → the editor unmounts and the **page becomes empty** (blank tab with the ornament; the tab stays open).
- Clicking "x" while a **Git Diff is the main editor** (Git Tree secondary-only) → the Git Tree + Changes panel are removed; the diff stays as main.
- The panel **never** disappears on its own (navigation, editor switches) — only the "x" removes it.
- Restarting the app with the Git Tree editor open restores it **with** its Changes panel (unchanged from US-616).
- The Git Tree model is disposed exactly once (no leaks, no double-dispose errors); app compiles and runs; "Git integration" off → unchanged.

## Implementation note — per-page singleton fix (2026-06-09, found in testing)

**Bug:** navigating away to a diff and back to the Git Tree (re-clicking `.git`) created a **new** `GitTreeEditorModel` each time, while the prior instance survived as the `git-changes` secondary (unconditional survival). Instances accumulated — all contributing the same `git-changes` panel — so the "x" closed only one per click; N round-trips required N+1 clicks.

**Root cause:** `navigatePageTo` (pageId path, used by the Explorer `.git` click) always builds a fresh editor via `createEditorFromFile` → `gitTreeEditorModule.newEditorModel`.

**Fix:** a Pattern B editor that survives navigation is now a **per-page singleton**. Two optional hooks on `EditorModel` (declared like the existing optional `hasTextSelection?()`), implemented only by `GitTreeEditorModel`:
- `matchesNavigationTarget(target, filePath)` — true when the navigation is a `git-tree` target for this instance's `repoRoot`.
- `onNavigationReuse()` — `this.refresh()` so a reused instance shows current data (a fresh open would have loaded fresh).

`navigatePageTo` checks for an existing matching instance **before** building one; if found, it promotes it back to main (`setMainEditor`) — or just refreshes if it's already main — and returns. No duplicate is ever created, so there is always exactly one Git Tree per page and one "x" click closes it. The hooks are generic (no git-tree coupling in `navigatePageTo`); any future survivable singleton editor can opt in.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | + `requestClose()` → `this.page?.removeSecondaryView(this)`; + `matchesNavigationTarget()` / `onNavigationReuse()` (singleton); import `decodeGitTreeLink` |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | + header "x" `IconButton` (CloseIcon) → `model.requestClose()`; import `CloseIcon` |
| `src/renderer/editors/base/EditorModel.ts` | + optional `matchesNavigationTarget?()` / `onNavigationReuse?()` hooks (navigation-singleton contract) |
| `src/renderer/api/pages/PagesLifecycleModel.ts` | `navigatePageTo` reuses a matching surviving singleton instead of building a duplicate |

## Files that need NO change

- `src/renderer/api/pages/PageModel.ts` — `removeSecondaryView`/`detach` already handle clear-main-if-main + remove + dispose. **No new method.**
- Backend git layer (`git-service.ts`, `git-ipc.ts`, `api*.ts`, `git.ts`) — complete in US-616.
- `GitChangesModel`, `GitTreeModel` — lifecycle/close is owned by the editor + page, not the data submodels.
- `Pages.tsx` — empty-page rendering already exists (`EmptyPageRoot`).
