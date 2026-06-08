# US-617: Git Tree "Changes" panel — manual close, empty-page, persistence

**Epic:** [EPIC-031 — Git Functionality Enhancements](../../epics/EPIC-031.md)
**Status:** Planned — depends on [US-616](../US-616-git-changes-panel/README.md) (awaiting user "let's implement")

## Goal

Give the "Changes" panel (built in US-616) its **manual-close lifecycle**:

1. An **"x" close button** in the panel header that **unmounts the Git Tree editor entirely** (the whole `GitTreeEditorModel`, not just the panel).
2. When the user clicks "x" **while the Git Tree editor is the main editor**, it closes **anyway** and the **page becomes empty**.
3. When the user clicks "x" while the Git Tree editor is only a **secondary** view (a Git Diff is the main editor), the Git Tree + panel are removed and the **diff stays** as main.
4. **Persistence/restore** — the panel (and an empty-but-open page, if that state can occur) restore correctly across navigation and app restart.

US-616 made the panel *appear, display, survive navigation, and open diffs* with an **unconditional-survive** lifecycle (no auto-unmount). This task adds the **only** way to remove it: the explicit "x". After this task the feature is complete per the user's description.

## Background — existing code to build on

### PageModel close/demote mechanics (verified)

`src/renderer/api/pages/PageModel.ts`:
- `setMainEditor(newEditor)` (l.335) — sets `_mainEditorId`; `setMainEditor(null)` clears it → `state.mainEditorId = null` → **content area renders empty** (the demote/empty path already exists).
- `promoteSecondaryToMain(model)` (l.414) — delegates to `setMainEditor`: if model **is** main → `setMainEditor(null)` (demote to empty, model stays alive in `secondaryViews[]`); else promotes.
- `removeSecondaryView(editor)` (l.286) — removes from `secondaryViews[]` **and disposes** it; falls back `activePanel`.
- `removeSecondaryViewWithoutDispose(editor)` (l.277) — what the `secondaryView = undefined` setter calls (no dispose).
- `dispose()` (l.667) — disposes all secondaries then main; `EditorModel.dispose()` is idempotent (safe for Pattern B double-dispose).

So the building blocks exist: clearing main (`setMainEditor(null)`) and removing+disposing the secondary (`removeSecondaryView`). This task composes them into a single "remove the Git Tree editor entirely" action and wires it to the "x".

### Close-button pattern in secondary-view headers

[secondary-views.md §5/§11](../../architecture/secondary-views.md): the panel component renders an `IconButton` (CloseIcon) into the portal header; the standard handler is `model.secondaryView = undefined`. Here the handler does **more** (also clears the main editor + disposes), so it calls a dedicated PageModel method rather than just clearing `secondaryView`.

### Persistence (Pattern B)

[secondary-views.md §7](../../architecture/secondary-views.md): secondaries persist as `SecondaryModelDescriptor[]`; on restore, a descriptor whose ID matches the `ownerEditor` is **deduplicated** (the existing main-editor instance is reused as the secondary). The Git Tree editor + its `git-changes` panel restore through this path — verify it still works after US-616 registers the panel, and decide what an **empty page** (main closed via "x", restart) should restore to.

## Implementation plan

1. **PageModel — a "close this editor completely" action.** Add a method (name TBD, e.g. `closeEditorCompletely(editor)`), that:
   - If `editor.id === this._mainEditorId` → `await this.setMainEditor(null)` (page becomes empty).
   - Remove it from the sidebar + dispose: `await this.removeSecondaryView(editor)` (or clear `secondaryView` then dispose) — ensuring the model is disposed **exactly once** and is gone from both `_mainEditorId` and `secondaryViews[]`.
   - Bump `secondaryViewsVersion` so the sidebar re-renders.
   - **Concern 1** nails the exact call order vs. `setMainEditor`'s own dispose logic (Pattern B: `setMainEditor(null)` must NOT dispose while the model is still a secondary, and `removeSecondaryView` then disposes once).
2. **`GitTreeEditorModel`** — add a small method `requestClose()` that calls `this.page?.closeEditorCompletely(this)`. (Keeps the view dumb; the model owns the intent.)
3. **`GitChangesSecondaryView.tsx`** — add the header **"x"** `IconButton` (CloseIcon, `name="git-changes-close"`, `title="Close Git Tree"`) next to the "Changes" title; `onClick` → `e.stopPropagation(); model.requestClose();`.
4. **Confirm only-manual-close.** Re-verify the US-616 `beforeNavigateAway`/`onMainEditorChanged` no-ops still hold — nothing auto-removes the panel; the "x" is the sole removal path.
5. **Persistence/restore.**
   - Verify the Git Tree editor + `git-changes` panel restore via the Pattern B dedup path after a restart while open.
   - Decide + implement the **empty-page** restore behavior: if the user closed the Git Tree main editor via "x" (page empty, no secondaries) and restarts — does the empty page persist, or is it pruned? **Concern 2.** Likely the page is closed/pruned if truly empty (no main, no secondaries), matching normal "last editor closed" behavior — confirm against how empty pages are handled today.
6. **No new colors/icons expected** beyond the existing `CloseIcon`.

## Concerns / Open questions

1. **Exact dispose order (Pattern B).** `setMainEditor(null)` followed by `removeSecondaryView(editor)` must dispose the model once and leave the page with `mainEditorId === null` and the editor absent from `secondaryViews[]`. Need to trace `setMainEditor`'s `survivesAsSecondary` branch so the first call doesn't dispose (model still secondary) and the second does. Resolve by reading `setMainEditor` l.335-392 during impl.
2. **Empty-page persistence.** What should a page with no main editor and no secondaries do on restart — persist as empty, or be pruned/closed? Pick the behavior consistent with existing "closed the last editor" handling. (If pages are normally closed when their last editor goes, then closing the Git Tree when it's the only thing on the page might close the **tab** rather than leave a blank one. Confirm the user's intent — they said "page should become empty"; verify whether an empty tab is a supported resting state or whether it should close.)
3. **"x" when a Git Diff is main.** Removing the Git Tree (secondary-only) must leave the diff as the main editor untouched — `removeSecondaryView` should not affect `_mainEditorId` in that case (it isn't the main). Verify.
4. **Confirm-on-close.** The Git Tree editor has no unsaved state (`skipSave = true`), so no `confirmRelease` prompt is needed. Confirm `removeSecondaryView`/dispose path doesn't trigger a spurious prompt.

## Acceptance criteria

- The "Changes" panel header shows an **"x"** button.
- Clicking "x" while the **Git Tree editor is the main editor** → the editor unmounts and the **page becomes empty** (or the tab closes if that's the confirmed resting behavior — Concern 2).
- Clicking "x" while a **Git Diff is the main editor** (Git Tree secondary-only) → the Git Tree + Changes panel are removed; the diff stays.
- The panel **never** disappears on its own (navigation, editor switches) — only the "x" removes it.
- Restarting the app with the Git Tree editor open restores it **with** its Changes panel.
- The Git Tree model is disposed exactly once (no leaks, no double-dispose errors); app compiles and runs; "Git integration" off → unchanged.

## Files changed (summary)

| File | Change |
|------|--------|
| `src/renderer/api/pages/PageModel.ts` | + `closeEditorCompletely(editor)` (clear main if main, remove+dispose secondary) |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | + `requestClose()` |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | + header "x" `IconButton` → `requestClose()` |

## Files that need NO change

- Backend git layer (`git-service.ts`, `git-ipc.ts`, `api*.ts`, `git.ts`) — complete in US-616.
- `GitChangesModel`, `GitTreeModel` — lifecycle/close is owned by the editor + page, not the data submodels.
