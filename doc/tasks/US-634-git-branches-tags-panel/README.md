# US-634: Git Tree "Branches & Tags" secondary view (EPIC-031)

**Status:** ✅ Implemented & verified (user-tested; all acceptance criteria met; `tsc --noEmit` + `eslint` clean).
Review/docs **deferred** to the EPIC-031 review pass — stays `[ ]` on the dashboard (implemented-but-unreviewed).
**Epic:** [EPIC-031 — Git Functionality Enhancements](../../epics/EPIC-031.md)
**Scope:** display-only (v1). Ref interactions (click-to-reveal-in-graph, double-click checkout, active-branch
sync) are explicitly deferred to follow-up EPIC-031 tasks.

## Goal

Add a second sidebar panel to the Git Tree editor — **`[<repoName>] Branches & Tags`** — that
renders the repository's refs as a Git-Extensions-style tree: local **Branches** (with `/`-folder
nesting), **Remotes** (one node per remote, branches nested beneath), and **Tags**. The panel lives
beside the existing **Changes** panel, belongs to the same `GitTreeEditorModel`, and survives
navigation exactly like Changes (only-manual-close).

As part of this change, the manual **"x" close button** moves from the **Changes** panel header to
the new **Branches & Tags** panel header (the Changes header keeps only "Show Git Tree" + "Refresh").
Because both panels belong to one model, the single "x" still tears down the whole Git Tree editor —
the move is which header hosts the button, not what it does.

## Answer to the user's question (origin under Remotes)

`origin` is the conventional default name Git gives the remote you cloned from — it is **one** remote
among potentially many. A repo can have any number of named remotes (`upstream` for a fork's canonical
source, a backup/mirror, a deploy target, a teammate's fork). The tree therefore groups branches
**per remote** under the `Remotes` root: each child of `Remotes` is a remote **name**, and that remote's
branches nest beneath it (with the same `feature/…` folder nesting as local branches). So `origin`
isn't the root — it's one entry under `Remotes`, and there can be siblings.

## Background — relevant existing code

### Secondary-view system (this is Pattern B, already in use)
- `GitTreeEditorModel.setPage()` sets `this.secondaryView = ["git-changes"]` on attach
  (`src/renderer/editors/git-tree/GitTreeEditorModel.ts:106`). Adding a second panel is just
  `["git-branches", "git-changes"]` — the composite-panel-key system (US-619,
  `ui/secondary-views/panel-key.ts`) already supports multiple panels per model and multiple repos.
- `beforeNavigateAway()` is a **no-op** (unconditional survival) — so the new panel survives navigation
  with zero extra logic; it rides on the same model as Changes.
- Close path: `GitChangesSecondaryView` header "x" → `model.requestClose()` →
  `page.removeSecondaryView(this)` (`GitTreeEditorModel.ts:288`). This disposes the **whole** model, so
  both panels disappear together and the page empties if the Git Tree was main. Moving the "x" to the new
  panel keeps this exact behavior.
- Registration: `secondaryViewRegistry.register({ id, label, loadComponent })` in
  `src/renderer/editors/register-editors.ts` (see the `git-changes` entry at line 69).
- Rendering: `SecondaryViews.tsx` iterates `model.secondaryView[]` in array order — so the array order
  decides top-to-bottom panel order in the sidebar.

### Submodel pattern (focused models, one per concern)
`GitTreeEditorModel` composes `gitTree` (`GitTreeModel`) + `changes` (`GitChangesModel`), each owned and
disposed by the editor, configured/reloaded in `syncGitTree()` and `refresh()`. The new refs panel adds a
third sibling submodel, `GitBranchesModel`, following `GitChangesModel` verbatim (transient state,
`configure(repoRoot)` / `reload()`, `git.enabled`-gated, dispose guard via a `write()` wrapper).

### Git data plumbing (5 layers — mirror the `gitStatus` path)
A ref-listing endpoint must be threaded through all five layers, exactly like `status`:
1. `src/ipc/git-ipc.ts` — DTO.
2. `src/main/git-service.ts` — `simple-git` implementation (never throws → empty on failure).
3. `src/ipc/api-types.ts` — `Endpoint` enum entry + signature in the endpoint map.
4. `src/ipc/renderer/api.ts` — renderer IPC wrapper.
5. `src/ipc/main/controller.ts` — handler method + `bindEndpoint`.
Then `src/renderer/api/git.ts` adds the gated, catch-to-empty convenience method.

### UIKit `Tree` (the renderer for the panel body)
`src/renderer/uikit/Tree/Tree.tsx` — virtualized tree over `ITreeItem[]`. Relevant props:
- `items: ITreeItem[]` where `ITreeItem = { value, label, icon?, section?, items? }`. `value` must be
  **unique across the whole tree**. `section: true` renders a non-interactive group header (perfect for
  the three roots: Branches / Remotes / Tags).
- `value` (selected item) or `isSelected(item)` for highlighting the current branch.
- `onChange(item)` (single click), `onItemDoubleClick(item, level)`.
- `getTooltip(item, level)` for the full ref name on hover.
- `defaultExpandedValues` / `defaultExpandAll` + `onExpandChange` for expansion.
- `getContextMenu(item, level)` for right-click actions.

### Ref colors / chips
`src/renderer/components/git-tree/RefBadge.tsx` exposes `REF_COLOR` (branch = blue, remote = lighter blue,
tag = pink, HEAD = green) — reusable to tint leaf labels/icons so the panel matches the commit-graph ref
chips.

### Icons
`src/renderer/theme/icons.tsx` has `GitIcon`, `FolderOpenIcon`, `NewFolderIcon`, `GlobeIcon` — but **no**
branch/tag icon. Minor: add a `TagIcon` (and optionally a `BranchIcon`) following the existing
`createIcon(size)(<path …/>)` pattern, or reuse `GitIcon` for branch leaves and `GlobeIcon` for remote
roots. Icons are plain SVG components (not theme-keyed), so no theme-file edits are required.

## Implementation plan

### 1. DTO — `src/ipc/git-ipc.ts`
Add:
```ts
/** Repository refs for the Git Tree "Branches & Tags" panel (EPIC-031 / US-634). */
export interface GitRefs {
    /** Current branch name (HEAD), or undefined when detached / no commits. */
    current?: string;
    /** Local branch names, e.g. "main", "feature/x". */
    localBranches: string[];
    /** Configured remote names, e.g. ["origin", "upstream"]. */
    remotes: string[];
    /** Remote-tracking branch names incl. remote prefix, e.g. "origin/main",
     *  "origin/feature/x". Excludes the symbolic "origin/HEAD". */
    remoteBranches: string[];
    /** Tag names, e.g. "v1.0.0". */
    tags: string[];
}
```

### 2. main/git-service.ts — `refs(dir)`
Add an exported `refs(dir: string): Promise<GitRefs>` that never throws (returns all-empty on failure,
mirroring `status`). Implementation via `for-each-ref` for precise, parse-stable output:
```ts
export async function refs(dir: string): Promise<GitRefs> {
    const empty: GitRefs = { localBranches: [], remotes: [], remoteBranches: [], tags: [] };
    try {
        const git = simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0");
        // %(refname:short) gives "main", "origin/feature/x", "v1.0.0".
        const raw = await git.raw([
            "for-each-ref", "--format=%(refname:short)",
            "refs/heads", "refs/remotes", "refs/tags",
        ]);
        const localBranches: string[] = [];
        const remoteBranches: string[] = [];
        const tags: string[] = [];
        // Classify by which ref namespace each came from — but %(refname:short)
        // drops the namespace, so query the three namespaces separately instead
        // (one for-each-ref per namespace) to avoid ambiguity.
        // … (see note below)
    } catch { return empty; }
}
```
**Note (parsing):** because `%(refname:short)` strips the namespace, run **three** `for-each-ref` calls —
`refs/heads`, `refs/remotes`, `refs/tags` — so each list is unambiguous. For `refs/remotes`, drop any
entry ending in `/HEAD` (the symbolic `origin/HEAD`). Get `remotes` (names) from `git remote` (a repo can
have a configured remote with zero branches). Get `current` from
`git revparse(["--abbrev-ref", "HEAD"])` (→ `"HEAD"`/throw when detached → leave undefined).

### 3–5. IPC wiring
- `api-types.ts`: add `gitRefs = "gitRefs"` to `Endpoint` and
  `[Endpoint.gitRefs]: (dir: string) => Promise<GitRefs>;` to the endpoint map (+ import `GitRefs`).
- `renderer/api.ts`: add the `gitRefs` wrapper (mirror `gitStatus`).
- `main/controller.ts`: add `gitRefs = async (_e, dir) => gitService.refs(dir)` and
  `bindEndpoint(Endpoint.gitRefs, controllerInstance.gitRefs)`.

### 6. renderer/api/git.ts — `refs(repoRoot)`
```ts
refs(repoRoot: string): Promise<GitRefs> {
    if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(EMPTY_REFS);
    return api.gitRefs(repoRoot).catch((): GitRefs => EMPTY_REFS);
}
```
(`EMPTY_REFS` const at top, like `EMPTY_STATUS`.)

### 7. components/git-tree/GitBranchesModel.ts (NEW)
Sibling of `GitChangesModel`. State `{ refs: GitRefs; loading: boolean; gitOk: boolean }`.
`configure(repoRoot)` resets on change; `reload()` probes + fetches `git.refs(repoRoot)`; `dispose()` +
guarded `write()`. Export from `components/git-tree/index.ts`.

Add the **stale-tracking** members used by the visibility-aware refresh (§11b) — these go on all three
submodels (`GitBranchesModel`, `GitChangesModel`, `GitTreeModel`), identical shape:
```ts
private _stale = false;
get stale(): boolean { return this._stale; }
/** Mark the data possibly out-of-date without fetching (the owning view is
 *  hidden). Cleared by the next reload(). */
markStale(): void { this._stale = true; }
```
`reload()` clears it at the start: `this._stale = false;` (set before the await so a concurrent change
during a fetch re-marks correctly). `configure()` (target changed) should also leave `_stale = false`
since it resets to empty.

### 8. components/git-tree/git-refs-tree.ts (NEW — pure helper)
`buildRefsTree(refs: GitRefs): ITreeItem[]` — converts the flat DTO to the three-root tree. Rules:
- **Branches** root (`section: true`, value `"sec:branches"`): split each local branch by `/`. A name
  with no `/` is a leaf directly under Branches; `feature/x` creates a folder node `feature` containing
  leaf `x`. Folders merge by path. Leaf `value` = `"local:" + fullName`; folder `value` =
  `"localdir:" + folderPath` (unique).
- **Remotes** root (value `"sec:remotes"`): one folder per remote name (`value "remote:" + name`); under
  each, that remote's branches (`remoteBranches` starting `name + "/"`), prefix-stripped then `/`-folded
  the same way (`value "remotebranch:" + fullName`, folder `value "remotedir:" + …`).
- **Tags** root (value `"sec:tags"`): flat list of tag leaves (`value "tag:" + name`) — no `/` folding.
- **Always render all three root sections** (Branches, Remotes, Tags), even when empty — they are the
  fixed top-level structure. An empty root is a childless `section` row (no chevron). (Resolved decision.)
- Carry the leaf "kind" (`"branch" | "remote" | "tag"`) and full ref name on each leaf so the view can
  tint via `REF_COLOR`, pick an icon, and build tooltips. Folder/remote/section nodes carry no kind.

Keep this a pure, side-effect-free function (unit-testable). It also drives the default-expand map
(below): the value of the **Branches** section root is `"sec:branches"`.

### 9. editors/git-tree/GitBranchesSecondaryView.tsx (NEW — the panel)
Mirror `GitChangesSecondaryView`'s shape:
- Type-guard `model instanceof GitTreeEditorModel` before hooks.
- Subscribe to `model.branches.state` + read `model.repoName`.
- Header (portaled to `headerRef`): `` `[${model.repoName}] Branches & Tags` `` + `<Spacer/>` +
  **Refresh** (`model.refresh()`) + **the close "x"** (`git-branches-close` → `model.requestClose()`,
  with `e.stopPropagation()`).
- Body: `<Tree>` from `buildRefsTree(refs)`:
  - **Expansion (controlled + persisted):** pass `defaultExpandedValues={model.state.get().branchesExpanded
    ?? { "sec:branches": true }}` — so on first open **only the Branches root is expanded**; Remotes and Tags
    start collapsed. Wire `onExpandChange` → accumulate into a map → `model.setBranchesExpanded(map)`, which
    persists it in the editor descriptor state (see §11a). On restore the persisted map is used.
  - **Current-branch highlight:** `isSelected={(item) => item.value === "local:" + current}` (read `current`
    from `refs`). (No graph sync in v1 — that is a deferred task.)
  - `getTooltip` → the leaf's full ref name.
  - **Icons:** branch leaves → `GitIcon`; remote-branch leaves → `GitIcon`; remote-name nodes → `GlobeIcon`;
    folder nodes → `FolderOpenIcon`; tag leaves → the new `TagIcon` (§8a). Tint leaf labels/icons via
    `REF_COLOR[kind]` to match the commit-graph ref chips.
  - `gitOk === false` → "Git is unavailable." (same as Changes).

### 8a. theme/icons.tsx — `TagIcon` (NEW)
Add `export const TagIcon = createIcon(24)(<path …/>)` following the existing pattern (e.g. `ArchiveIcon`,
`SaveIcon`). Shape: a **label/tag** — a rectangle with the two **bottom** corners cut to a point and a small
hole (circle) centered above the cut. No theme-file edits (icons are plain SVG components, not theme-keyed).
Branches reuse the existing `GitIcon`.

### 10. register-editors.ts
```ts
secondaryViewRegistry.register({
    id: "git-branches",
    label: "Branches & Tags",
    loadComponent: () => import("./git-tree/GitBranchesSecondaryView"),
});
```

### 11. GitTreeEditorModel.ts — wire the submodel + panel + move the "x"
- `readonly branches = new GitBranchesModel();`
- `setPage`: `this.secondaryView = ["git-branches", "git-changes"];` (Branches & Tags on top of Changes —
  Git-Extensions-like, resolved decision).
- `dispose()`: `this.branches.dispose()`.

### 11a. GitTreeEditorModel.ts — persist the Branches tree expansion
Add a persisted field to `GitTreeEditorState` (round-trips through the page descriptor like `columnLayout` /
`bottomPanelHeight`):
```ts
/** Persisted expansion map for the "Branches & Tags" tree (keyed by ITreeItem
 *  value, e.g. "sec:branches", "localdir:feature"). Undefined → default
 *  (only "sec:branches" expanded). (US-634) */
branchesExpanded?: Record<string, boolean>;
```
And a bound setter (mirrors `setColumnLayout`):
```ts
setBranchesExpanded = (map: Record<string, boolean>): void => {
    this.state.update((s) => { s.branchesExpanded = map; });
};
```

### 11b. GitTreeEditorModel.ts — visibility-aware refresh (replaces the single `refresh`)
**Problem:** the always-on US-624 watcher fires `refresh()` on every working-tree change. Reloading all three
submodels (commit log + status + refs) each time is wasteful when only one surface is visible (the accordion
shows **one** expanded panel at a time, and the tree body only renders when the Git Tree is the page's main
editor).

**Visibility signals** (all available on `this.page`, typed `IPageHost`):
- Tree body visible ⟺ `this.page?.mainEditorInstance === this`.
- A panel is the expanded one ⟺ `this.page?.activePanelId === <panelId>` (single-expand accordion; `activePanelId`
  is the bare id — US-619).

**Split `refresh()` into three private reloaders + a visibility-gated dispatcher.** Replace the current
`refresh = () => { … reload all … }` with:
```ts
private isTreeVisible(): boolean {
    return this.page?.mainEditorInstance === this;
}
private isPanelVisible(panelId: string): boolean {
    return this.page?.activePanelId === panelId;
}

/** Reload the commit graph (configure-first, self-healing). */
private refreshTree = (): void => {
    this.gitTree.configure(this.state.get().repoRoot);
    void this.gitTree.reload();
};
private refreshChanges = (): void => {
    this.changes.configure(this.state.get().repoRoot);
    void this.changes.reload();
};
private refreshBranches = (): void => {
    this.branches.configure(this.state.get().repoRoot);
    void this.branches.reload();
};

/** Unified refresh (watcher + toolbar/panel Refresh buttons). Reloads only the
 *  CURRENTLY-VISIBLE surfaces; hidden ones are marked stale and reload lazily
 *  when next revealed (onPanelExpanded / promote-to-main). (US-634) */
refresh = (): void => {
    if (this.isTreeVisible()) this.refreshTree(); else this.gitTree.markStale();
    if (this.isPanelVisible("git-changes")) this.refreshChanges(); else this.changes.markStale();
    if (this.isPanelVisible("git-branches")) this.refreshBranches(); else this.branches.markStale();
};
```

**Reveal-time catch-up.** Override `onPanelExpanded` (base no-op; fired with the bare panel id when the user
expands one of our panels — `PageModel.setSecondaryViewsState`):
```ts
onPanelExpanded(panelId: string): void {
    if (panelId === "git-changes" && this.changes.stale) this.refreshChanges();
    else if (panelId === "git-branches" && this.branches.stale) this.refreshBranches();
}
```
And the tree catches up on promote-back: `onNavigationReuse()` already calls `refresh()` — keep it, but only
reload the tree when stale to avoid redundant log fetches:
```ts
onNavigationReuse(): void {
    if (this.gitTree.stale || this.isTreeVisible()) this.refreshTree();
    this.refresh(); // also catch up the visible panel
}
```
*(Simplest correct form: `onNavigationReuse` → `this.refresh()`; since promote makes the tree main,
`isTreeVisible()` is true and the tree reloads. The stale check is a minor extra saving — implementer's call.)*

**Initial load stays eager.** `syncGitTree()` keeps configuring + reloading **all three** once at open/restore,
so every panel has content the moment it is first expanded (the optimization targets the *repeated* watcher
refreshes, not the one-time initial population):
```ts
syncGitTree(): void {
    const repoRoot = this.state.get().repoRoot;
    this.gitTree.configure(repoRoot);   void this.gitTree.reload();
    this.changes.configure(repoRoot);   void this.changes.reload();
    this.branches.configure(repoRoot);  void this.branches.reload();
    this.startWatching();
}
```

### 12. GitChangesSecondaryView.tsx — remove the "x"
Delete the `git-changes-close` `<IconButton>` block (and its comment) from the header. Keep "Show Git
Tree" + "Refresh". Drop the now-unused `CloseIcon` import.

### 13. components/git-tree/index.ts
Export `GitBranchesModel` and `buildRefsTree` (+ any shared ref-kind type).

## Decisions (resolved with the user)

1. **Interactions:** display-only for v1. Click-to-reveal-in-graph, double-click checkout, and active-branch
   sync to the commit graph are **deferred** to follow-up EPIC-031 tasks (they need a new scroll-to-commit /
   select-by-hash API on `GitTreeModel`/`GitTree`, and a `git checkout` endpoint — out of scope here).
2. **Panel order:** Branches & Tags **above** Changes — `["git-branches", "git-changes"]`.
3. **Empty sections:** always render all three roots (Branches, Remotes, Tags), even when empty.
4. **Default expansion:** only the **Branches** root expanded on first open; expansion map **persisted** in
   the editor descriptor state (`branchesExpanded`).
5. **Refresh:** visibility-aware (§11b) — only the currently-visible surface reloads on a watcher tick; hidden
   surfaces are marked stale and reload lazily on reveal. This both satisfies correctness and avoids the
   "refresh everything every change" cost.
6. **Tags:** flat (no `/` folding).
7. **Icons:** `GitIcon` for branch leaves; new `TagIcon` (label glyph — rectangle, two bottom corners cut to a
   point, small centered hole) for tags; `GlobeIcon` for remote-name nodes; `FolderOpenIcon` for folders.

## Files changed

| File | Change |
|------|--------|
| `src/ipc/git-ipc.ts` | + `GitRefs` interface |
| `src/main/git-service.ts` | + `refs(dir)` (three `for-each-ref` + `git remote` + current HEAD) |
| `src/ipc/api-types.ts` | + `Endpoint.gitRefs` + endpoint-map signature (+ import `GitRefs`) |
| `src/ipc/renderer/api.ts` | + `gitRefs` wrapper |
| `src/ipc/main/controller.ts` | + `gitRefs` handler + `bindEndpoint` |
| `src/renderer/api/git.ts` | + `refs(repoRoot)` (gated, catch→`EMPTY_REFS`) |
| `src/renderer/theme/icons.tsx` | + `TagIcon` |
| `src/renderer/components/git-tree/GitBranchesModel.ts` | NEW submodel (+ `stale`/`markStale`) |
| `src/renderer/components/git-tree/git-refs-tree.ts` | NEW pure `buildRefsTree()` helper |
| `src/renderer/components/git-tree/GitChangesModel.ts` | + `stale`/`markStale` (reload clears) |
| `src/renderer/components/git-tree/GitTreeModel.ts` | + `stale`/`markStale` (reload clears) |
| `src/renderer/components/git-tree/index.ts` | export `GitBranchesModel`, `buildRefsTree`, ref-kind type |
| `src/renderer/editors/git-tree/GitBranchesSecondaryView.tsx` | NEW panel component |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | − remove the `git-changes-close` "x" + `CloseIcon` import |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | + `branches` submodel; `secondaryView` array; `branchesExpanded` state + setter; split visibility-aware `refresh`; `onPanelExpanded`; `dispose` |
| `src/renderer/editors/register-editors.ts` | + register `git-branches` secondary view |

## Files that need NO change (don't re-investigate)

- `ui/secondary-views/SecondaryViews.tsx`, `panel-key.ts`, `secondary-view-registry.ts` — multi-panel +
  composite-key machinery already supports a 2nd panel per model (US-619).
- `api/pages/PageModel.ts` — `activePanelId`, `mainEditorInstance`, `onPanelExpanded` dispatch, and
  Pattern-B survival/dispose already exist; no change.
- `EditorModel.ts` — `secondaryView` setter, `onPanelExpanded` base hook already present.
- `uikit/Tree/*` — used as-is (no new props needed).

## Acceptance criteria

- Opening a repo's Git Tree shows **two** sidebar panels: `[<repo>] Branches & Tags` and `[<repo>] Changes`.
- The Branches & Tags tree shows local branches (with `/`-folder nesting), a Remotes root with one node per
  remote (branches nested), and a Tags root — matching the structure in the task description.
- All three roots (Branches, Remotes, Tags) always render, even when empty.
- On first open only **Branches** is expanded; collapsing/expanding nodes persists across navigation-away/back
  and app restart (via `branchesExpanded` in the descriptor).
- The current branch is visually distinguished; hovering a ref shows its full name.
- **Visibility-aware refresh:** a watcher tick reloads only the visible surface — the expanded panel
  (Changes *or* Branches, never both) and the tree only while it is the main editor. A hidden panel reloads
  the next time it is expanded; the tree reloads when promoted back to main. No "reload all three on every
  change".
- The **"x"** close button appears **only** on the Branches & Tags header; the Changes header no longer has
  it. Clicking "x" tears down the whole Git Tree editor (both panels), emptying the page if it was main —
  unchanged from today.
- The panel survives navigation (clicking a changed file opens its diff while both panels persist) and
  restores across app restart, like Changes.
- Refresh (manual + auto-refresh watcher) updates the refs tree.
- Multiple repos each get their own pair of panels (distinct composite keys).
- `git.enabled` off / git missing → panel shows "Git is unavailable." and does no git work.

## Completion (EPIC-031 deferred-review model)

This is an epic task: on completion, keep it `[ ]` in the dashboard and do **not** run
`/review`·`/document`·`/userdoc` unless explicitly requested. When the epic's review pass runs, update
`doc/architecture/secondary-views.md` (the GitTreeEditorModel row + "Git Changes panel" section) to
describe the two-panel layout and the relocated "x" — ticket-free, current-state only.
