# US-781: Merge Git Tree "Changes" and "Branches & Tags" into one secondary view

## Goal

Collapse the Git Tree editor's two sidebar panels ("Changes" and "Branches & Tags")
into a **single** secondary view. Inside that panel, a `SegmentedControl` toolbar
(`Changes` / `Branches` / `Tags`, defaulting to `Changes`) switches the body between
the working-tree status, the branch tree, and the tags list. This removes the
visual clutter of two stacked Git panels per open repo — which is acute when several
repos' Git Trees are open at once for review.

## Background

### Current structure (two panels)

The Git Tree editor (`GitTreeEditorModel`) registers **two** secondary views and
declares both in `setPage`:

```ts
// GitTreeEditorModel.setPage()
this.secondaryView = ["git-branches", "git-changes"];   // Branches on top of Changes
```

- **`git-changes`** → `GitChangesSecondaryView.tsx` — Unstaged (top) + Staged (bottom)
  `FileGrid`s split by a `Splitter`; Staged section has a Commit button + stage/unstage
  arrows. Header has only a **Refresh** button (a comment notes "Show Git Tree" and the
  close "x" live on the Branches panel).
- **`git-branches`** → `GitBranchesSecondaryView.tsx` — a display-only refs `Tree`
  (Branches with `/`-folding + Remotes + Tags), built by `buildRefsTree` and decorated
  by a local `decorateNodes`. Header hosts **Sort-alpha**, **Refresh**, the **close "x"**
  (`model.requestClose()` — tears down the whole editor), and the **"Show Git Tree"**
  zone-button (`onShowMain` / `showMainActive`).

Both views are registered in `register-editors.ts`:

```ts
secondaryViewRegistry.register({ id: "git-branches", label: "Branches & Tags",
    loadComponent: () => import("./git-tree/GitBranchesSecondaryView") });
secondaryViewRegistry.register({ id: "git-changes", label: "Changes",
    loadComponent: () => import("./git-tree/GitChangesSecondaryView") });
```

### Submodels (unchanged)

`GitTreeEditorModel` composes three focused submodels — keep all three:
- `gitTree` — commit history (the main editor body).
- `changes` (`GitChangesModel`) — unstaged/staged status; `stale`/`markStale()`/`reload()`.
- `branches` (`GitBranchesModel`) — refs (local/remote branches, tags, current);
  `stale`/`markStale()`/`reload()`; also drives ahead/behind + fetch/push/pull and the
  `onGetMenuItems` "Copy Remote URL".

### Visibility-aware refresh (the part most affected)

`refresh()` reloads only currently-visible surfaces; hidden ones are marked stale and
reload lazily on reveal (`onPanelExpanded`). Today it keys off **two** panel ids:

```ts
refresh = (): void => {
    if (this.isTreeVisible()) { this.refreshTree(); void this.branches.reloadAheadBehind(); }
    else this.gitTree.markStale();
    if (this.isPanelVisible("git-changes")) this.refreshChanges(); else this.changes.markStale();
    if (this.isPanelVisible("git-branches")) this.refreshBranches(); else this.branches.markStale();
};

onPanelExpanded(panelId: string): void {
    if (panelId === "git-changes" && this.changes.stale) this.refreshChanges();
    else if (panelId === "git-branches" && this.branches.stale) this.refreshBranches();
}
```

- `isPanelVisible(panelId)` → `this.page?.activePanelId === panelId` (the sidebar is a
  single-expand accordion).
- `isTreeVisible()` → the Git Tree grid is the page's main editor.

With one panel, "which submodel is visible" is no longer the panel id alone — it's the
**active segment** within the single panel. This is the core logic change.

### Reusable pieces

- **`SegmentedControl`** (`uikit/SegmentedControl`) — `items: ISegment[]`, `value`,
  `onChange`, `size`. `ISegment.label` accepts a `ReactNode`. This is the toolbar control.
- **`SideBarPanelHeader`** — `icon` / `badge` / `title` / `actions` + the standardized
  `onShowMain` / `showMainTitle` / `showMainActive` "Show in main view" zone-button.
- **`buildRefsTree(refs, alphabetical)`** (`components/git-tree/git-refs-tree.ts`) — returns
  `[branchesRoot, remotesRoot, tagsRoot]` (`BRANCHES_ROOT_VALUE` / `REMOTES_ROOT_VALUE` /
  `TAGS_ROOT_VALUE`). Reuse as-is and split by root for the Branches vs Tags segments.
- **`SecondaryViewProps.expanded`** (added in US-780) — `true` when this panel is the
  expanded one. Collapsed panels stay mounted (`alwaysRenderContent`, `display:none`).

## Design decisions

1. **Keep the single panel's registry id as `"git-changes"`.** Reusing the existing id
   avoids a persisted-state migration for the surviving panel; only the now-removed
   `"git-branches"` id needs cleanup (see step 5 + Concern #1). The component **file** is
   renamed for clarity (it is no longer changes-only), but the id string is stable.

2. **Active segment is persisted editor state.** Add `gitPanelTab?: "changes" | "branches"
   | "tags"` (default `"changes"`) to `GitTreeEditorState`, round-tripping through the page
   descriptor like `bottomPanelTab` / `branchesExpanded`. A reopened repo restores the last
   segment.

3. **Panel is named "Git"; header title shows the changed-file count: `Git (N)`** (just `Git`
   when there are no changes), in every segment (the registry `label` is also `"Git"`). The
   count lives in the **header title** — not the segment label — so it stays visible when the
   panel is collapsed, letting the user spot which repos have changes without expanding each
   panel. The active segment is conveyed by the SegmentedControl in the body. The repo-name
   badge is kept in all segments.

4. **Header actions:**
   - **Refresh** — always shown; `model.refresh()` (now reloads the active segment).
   - **Close "x"** (`model.requestClose()`) and **"Show Git Tree"** zone — moved here from
     the Branches header; shown in all segments. These are the editor's sole manual-close +
     promote-to-main affordances and must always be reachable.
   - **Sort-alpha ("AZ")** does *not* go in the header — it lives in the body toolbar next to
     the SegmentedControl (see decision #7).

7. **Sort-alpha ("AZ") lives in the body toolbar, right of the SegmentedControl, shown only
   for `branches` / `tags`.** It orders refs and is meaningless for the changes lists, so it
   sits beside the segment selector it governs (not in the always-visible header) and is hidden
   when the `Changes` segment is active. Same `branchesAlphabetical` flag +
   `model.setBranchesAlphabetical` as today.

5. **Branches segment shows Branches + Remotes; Tags segment shows tags flat.** The current
   "Branches & Tags" tree bundles all three roots. Splitting Tags into its own segment leaves
   the Branches segment with the Branches + Remotes roots (everything branch-like). See
   Concern #2.

6. **Component split** — one container panel + three body views (no headers; the container
   owns the single shared header):
   - `GitPanelSecondaryView.tsx` (**new**, replaces `GitChangesSecondaryView.tsx`) — the
     registered panel. Renders the shared header + the SegmentedControl toolbar + the active
     body. Owns the `gitPanelTab` segment wiring and computes the changes `fileCount` for the
     header title.
   - `GitChangesView.tsx` (**new**) — the Unstaged/Staged splitter content (the current
     `GitChangesBody` + `ChangesList`, **minus** the `SideBarPanelHeader`).
   - `GitRefsView.tsx` (**new**) — the refs body with `show: "branches" | "tags"` (the current
     `GitBranchesBody` + `decorateNodes`, **minus** the header). `branches` → Branches +
     Remotes roots; `tags` → the tag leaves rendered flat.
   - Delete `GitChangesSecondaryView.tsx` and `GitBranchesSecondaryView.tsx`.

## Implementation plan

### Step 1 — `GitTreeEditorState`: add the segment field + setter

File: `src/renderer/editors/git-tree/GitTreeEditorModel.ts`

- Add to `GitTreeEditorState` (near `bottomPanelTab`):
  ```ts
  /** Active segment of the merged Git panel ("changes" | "branches" | "tags").
   *  Undefined → "changes". Persisted via the page descriptor like `bottomPanelTab`. */
  gitPanelTab?: "changes" | "branches" | "tags";
  ```
- Add a bound setter (near `setBottomPanelTab`) — it persists **and** catches up a stale
  submodel for the newly-active segment:
  ```ts
  /** Switch the merged Git panel's active segment (US-781). Persists the choice and,
   *  if the now-active segment's submodel went stale while hidden, reloads it. */
  setGitPanelTab = (t: "changes" | "branches" | "tags"): void => {
      this.state.update((s) => { s.gitPanelTab = t; });
      if (this.isPanelVisible("git-changes")) {
          if (t === "changes" && this.changes.stale) this.refreshChanges();
          else if ((t === "branches" || t === "tags") && this.branches.stale) this.refreshBranches();
      }
  };
  ```

### Step 2 — `GitTreeEditorModel`: single panel + segment-aware refresh

File: `src/renderer/editors/git-tree/GitTreeEditorModel.ts`

- `setPage` — declare the single panel, and **reset unconditionally** so a restored editor
  that persisted the old two-id array (`["git-branches","git-changes"]`) is migrated
  (Concern #1):
  ```ts
  setPage(page: IPageHost | null): void {
      super.setPage(page);
      if (page) this.secondaryView = ["git-changes"];
  }
  ```
- Add a private helper for "is the changes/branches data currently on screen", driven by the
  active segment:
  ```ts
  /** The merged panel is expanded AND showing the given segment family. */
  private isChangesVisible(): boolean {
      return this.isPanelVisible("git-changes") && (this.state.get().gitPanelTab ?? "changes") === "changes";
  }
  private isRefsVisible(): boolean {
      if (!this.isPanelVisible("git-changes")) return false;
      const t = this.state.get().gitPanelTab ?? "changes";
      return t === "branches" || t === "tags";
  }
  ```
- Rework `refresh()` to gate on segment instead of two panel ids:
  ```ts
  refresh = (): void => {
      if (this.isTreeVisible()) { this.refreshTree(); void this.branches.reloadAheadBehind(); }
      else this.gitTree.markStale();
      if (this.isChangesVisible()) this.refreshChanges(); else this.changes.markStale();
      if (this.isRefsVisible()) this.refreshBranches(); else this.branches.markStale();
  };
  ```
- Rework `onPanelExpanded` — only one panel now; catch up the active segment's submodel:
  ```ts
  onPanelExpanded(panelId: string): void {
      if (panelId !== "git-changes") return;
      const t = this.state.get().gitPanelTab ?? "changes";
      if (t === "changes" && this.changes.stale) this.refreshChanges();
      else if ((t === "branches" || t === "tags") && this.branches.stale) this.refreshBranches();
  }
  ```

### Step 3 — New `GitChangesView.tsx` (Unstaged/Staged body, no header)

File: `src/renderer/editors/git-tree/GitChangesView.tsx` (**new**)

- Move `GitChangesBody` + `ChangesList` here from `GitChangesSecondaryView.tsx`, **dropping**
  the `SideBarPanelHeader` render and the `headerRef` / `icon` props. Export a default
  component `GitChangesView({ model }: { model: GitTreeEditorModel })` that returns the
  `git-changes` root `Panel` → the Unstaged splitter + Staged splitter content (everything
  currently inside the `!gitOk ? … : <>…</>` branch).
- Keep all behavior: `doCommit`, the Commit button, stage/unstage arrows, `reset`, range
  selection, the `git-changes-splitter`, the `ResizeObserver` 50%-init, `handleChangeHeight`.
- The `fileCount` memo moves **up** to the container (it feeds the header title) — this body
  no longer needs it.

### Step 4 — New `GitRefsView.tsx` (refs body, no header)

File: `src/renderer/editors/git-tree/GitRefsView.tsx` (**new**)

- Move `decorateNodes` + the body of `GitBranchesBody` here, **dropping** the
  `SideBarPanelHeader` render (incl. the `actions` block, `onShowMain`, and the close button —
  those move to the container header). Export
  `GitRefsView({ model, show }: { model: GitTreeEditorModel; show: "branches" | "tags" })`.
- Build the tree once: `buildRefsTree(refs, alphabetical)` → `[branchesRoot, remotesRoot,
  tagsRoot]` (import `decorateNodes` continues to run over whatever subset is rendered).
  - `show === "branches"` → render the `Tree` with `[branchesRoot, remotesRoot]` (keep
    `/`-folding, expansion persistence via `branchesExpanded`, `defaultExpandedValues`,
    `onExpandChange`).
  - `show === "tags"` → render the tag **leaves flat** (the children of `tagsRoot`,
    decorated) — no root wrapper, no chevrons. A `Tree` with leaf-only items works and keeps
    the existing `onSelect` (reveal-in-graph) + `getContextMenu` ("Switch to Tag … Commit").
- Keep `onSelect` (→ `model.revealRef`), `getContextMenu` (Switch to branch/remote/tag),
  `getTooltip`, the hover `activeIndex` state, and `currentValue` head-green decoration.
- The Sort-alpha state (`branchesAlphabetical`) is still read here for ordering; the **toggle
  button** moves to the container's **body toolbar** (next to the SegmentedControl), not the
  header (it calls `model.setBranchesAlphabetical`).

### Step 5 — New `GitPanelSecondaryView.tsx` (the merged container)

File: `src/renderer/editors/git-tree/GitPanelSecondaryView.tsx` (**new**, replaces
`GitChangesSecondaryView.tsx`)

- Default export `GitPanelSecondaryView({ model, headerRef, icon }: SecondaryViewProps)` with
  the same `model instanceof GitTreeEditorModel` type-guard, delegating to a `…Body`.
- Read `gitPanelTab` (default `"changes"`), `branchesAlphabetical`, `isMainEditor`
  (`useOptionalState(model.page?.state, () => model.isMain, false)`), and the changes
  `unstaged`/`staged` (for `fileCount`, which feeds the header title).
- **Header** (`SideBarPanelHeader`):
  - `badge` = repo-name `Tag` (as today).
  - `title` = `fileCount ? \`Git (${fileCount})\` : "Git"` (same in every segment; count visible
    while collapsed).
  - `actions` = `<Refresh> <Close>` (no Sort-alpha here — it's in the body toolbar).
  - `onShowMain` / `showMainTitle="Show Git Tree"` / `showMainActive={isMainEditor}` →
    `if (!isMainEditor) model.showGitTree()`.
- **Toolbar row** (in the body, above the content), `direction="row"`, `align="center"`,
  `shrink={false}`, small padding: the SegmentedControl on the left, a `Spacer`, then the
  **Sort-alpha ("AZ") `IconButton` — rendered only when `tab !== "changes"`** (right edge):
  ```tsx
  <Panel name="git-panel-toolbar" direction="row" align="center" paddingX="xs" paddingY="xs" gap="sm" shrink={false}>
      <SegmentedControl
          name="git-panel-tabs"
          size="sm"
          value={tab}
          onChange={(v) => model.setGitPanelTab(v as "changes" | "branches" | "tags")}
          items={[
              { value: "changes", label: "Changes" },
              { value: "branches", label: "Branches" },
              { value: "tags", label: "Tags" },
          ]}
      />
      <Spacer />
      {tab !== "changes" && (
          <IconButton
              name="git-branches-sort-alpha"
              size="sm"
              active={alphabetical}
              title={alphabetical ? "Sort alphabetically (on)" : "Sort alphabetically (off — historical)"}
              icon={<SortAlphaIcon />}
              onClick={() => model.setBranchesAlphabetical(!alphabetical)}
          />
      )}
  </Panel>
  ```
- **Body** by segment: `changes` → `<GitChangesView model={model} />`; `branches` →
  `<GitRefsView model={model} show="branches" />`; `tags` → `<GitRefsView model={model}
  show="tags" />`. Wrap in a `flex={1}` column `Panel` with `height={0}` so the body fills and
  scrolls within the panel (mirrors the existing inner containers).
- Keep the `!gitOk` "Git is unavailable." fallback (read `gitOk` from whichever submodel the
  active segment uses, or just from `changes`).

### Step 6 — Registry + cleanup

File: `src/renderer/editors/register-editors.ts`
- **Remove** the `id: "git-branches"` registration entirely.
- Point the `id: "git-changes"` registration's `loadComponent` at the new file:
  `() => import("./git-tree/GitPanelSecondaryView")`, and relabel `"Changes"` → `"Git"`.

Files to delete:
- `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx`
- `src/renderer/editors/git-tree/GitBranchesSecondaryView.tsx`

### Step 7 — Build + lint

- `npx tsc --noEmit` and `npm run lint` must be clean.

## Files that need NO changes

- `components/git-tree/git-refs-tree.ts` (`buildRefsTree`) — reused as-is, split by root.
- `components/git-tree/GitBranchesModel.ts`, `GitChangesModel.ts`, `GitTreeModel.ts` — the
  submodels are unchanged; only the editor's visibility gating changes.
- `uikit/SegmentedControl/*`, `SideBarPanelHeader.tsx`, `secondary-view-registry.ts`,
  `SecondaryViews.tsx`, `LazySecondaryView.tsx`, `panel-key.ts` — used as-is.
- `GitTreeEditorView.tsx` (the main editor body / bottom panel) — untouched.

## Concerns / Open questions

1. **Persisted `secondaryView` migration.** Existing Git Tree pages persisted
   `secondaryView: ["git-branches","git-changes"]`. After this change `"git-branches"` is no
   longer registered. The plan resets `secondaryView = ["git-changes"]` **unconditionally** in
   `setPage` (the git-tree editor deterministically has exactly one panel), which migrates old
   sessions cleanly. Confirm there's no code path that reads the persisted array before
   `setPage` runs. *(Resolved by unconditional reset; calling out for review.)*

2. **Does the "Branches" segment include Remotes?** **Resolved (confirmed):** yes — the
   Branches segment shows the Branches + Remotes roots (everything branch-like), and only Tags
   moves out into its own segment.

3. **Header title vs. SegmentedControl redundancy.** **Resolved (confirmed):** keep the
   per-segment title (`Git — Changes (N)` / `Git — Branches` / `Git — Tags`). When expanded it's
   mildly redundant with the SegmentedControl, but it's the only context in the **collapsed**
   header strip (the control lives in the body and is hidden when collapsed).

4. **Sort-alpha for Tags.** The Sort-alpha toggle is shown for both Branches and Tags and orders
   tags alphabetically vs. historical (the existing `branchesAlphabetical` flag already governs
   tag order in `buildRefsTree`). Reusing one flag for both is intended.

5. **Segment is preserved across opening a diff (no reset).** Opening a changed file's diff
   replaces only the page's **main** view (the commit grid) with the diff; the merged Git panel
   is a Pattern-B secondary view that was already on the sidebar and **stays mounted there**
   (`beforeNavigateAway` is a no-op). It is not unmounted/reopened, so the active segment is
   preserved in-memory (and also persisted in `gitPanelTab`). The `"changes"` default applies
   only to a brand-new panel that never had a segment chosen.

## Acceptance criteria

- The Git Tree editor shows **one** sidebar panel (no separate "Branches & Tags" panel).
- The panel body has a `Changes` / `Branches` / `Tags` SegmentedControl; `Changes` is selected
  by default on first open.
- **Changes** segment = the current Unstaged/Staged lists with Commit + stage/unstage, unchanged.
- **Branches** segment = the branch tree (Branches + Remotes) as before, with reveal-in-graph,
  Switch context menu, head-green current branch, expansion persistence, and Sort-alpha.
- **Tags** segment = a flat list of tags with the Switch-to-tag context menu + reveal-in-graph.
- The close "x" and "Show Git Tree" affordances work from the merged header in every segment.
- Refresh and the US-624 auto-refresh watcher reload only the active segment's data; switching
  to a segment whose data went stale while hidden reloads it.
- The selected segment, branch expansion, and sort order survive navigation-away/back + restart.
- `tsc --noEmit` and `npm run lint` are clean.

## Files Changed (summary)

| File | Change |
|------|--------|
| `editors/git-tree/GitTreeEditorModel.ts` | Add `gitPanelTab` state + `setGitPanelTab`; single-panel `setPage`; segment-aware `refresh` / `onPanelExpanded`; `isChangesVisible` / `isRefsVisible` helpers |
| `editors/git-tree/GitPanelSecondaryView.tsx` | **New** — merged panel: shared header (per-segment title, segment-aware actions, close + Show-Git-Tree) + SegmentedControl + active body |
| `editors/git-tree/GitChangesView.tsx` | **New** — Unstaged/Staged body extracted from `GitChangesSecondaryView` (no header) |
| `editors/git-tree/GitRefsView.tsx` | **New** — refs body (`show: "branches" \| "tags"`) extracted from `GitBranchesSecondaryView` (no header) |
| `editors/git-tree/GitChangesSecondaryView.tsx` | **Deleted** |
| `editors/git-tree/GitBranchesSecondaryView.tsx` | **Deleted** |
| `editors/register-editors.ts` | Remove `git-branches` registration; repoint `git-changes` `loadComponent` to `GitPanelSecondaryView` |
