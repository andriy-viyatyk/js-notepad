# US-618: Git Diff "Revisions" secondary view + filtered-list datetime column + L/R side-select

**Epic:** [EPIC-031 — Git Functionality Enhancements](../../epics/EPIC-031.md)
**Status:** ✅ Completed (2026-06-09) — user-tested; `/review` (clean, 2 nits applied) + `/document` + `/userdoc` done; marked `[x]`. Stays listed under EPIC-031 (per-task model; not moved to completed.md).

## Goal

Give the **Git Diff editor** its own sidebar "Revisions" panel that duplicates the toolbar
from/to popover selection, persistently visible while a Git Diff is open. In the same task,
change the **filtered (file-scoped) commit list** rendering — used by both the from/to
popovers and the new panel — to drop the swimlane graph and lead with a resizable
**commit-datetime** column.

Three coordinated pieces:

1. **Filtered-list column change (popovers + panel).** In the file-scoped (`compact`) Git Tree
   layout, remove the leading graph column (the swimlane graph is meaningless for a filtered
   single-file history) and add a **commit-datetime** column as the first column, initialized
   narrow enough to show only the date (resizable to reveal the time). The whole-repo Git Tree
   editor is **unchanged** (it keeps the graph).
2. **New "Revisions" secondary view for the Git Diff editor.** A sidebar panel showing the
   file's filtered commit list (same data as the popovers) plus, at the top, an **Unstaged**
   row and a **Staged** row (the latter only when the file has staged changes). The panel
   **must not survive navigation** — switching the page to another file, or switching the Git
   Diff back to the Text Editor, removes it (the opposite of the Git Tree "Changes" panel).
3. **L/R side-select toggles (panel only).** Each row (the Unstaged/Staged rows and every
   commit row) shows two small toggles, **L** (left / `from`) and **R** (right / `to`), with an
   active state (accent background) that reflects the Git Diff editor's current comparison:
   the row holding the `from` revision shows **L** active; the row holding the `to` revision
   shows **R** active. Clicking a toggle sets that side, exactly like picking in the popover.

**Single source of truth (firm requirement).** The left/right selection is the **one**
`from`/`to` pair in `FileDiffEditorState`. Both the toolbar popovers and the panel **read** those
fields and **mutate** them through the same `model.setFrom` / `model.setTo` — there is no
panel-local or popover-local copy. So picking in either place updates the Monaco diff, the
popover labels, and the panel's L/R highlight together, always in sync.

This panel intentionally **duplicates** the from/to popover selection. That's acceptable —
future increments will add more capability to the panel (out of scope here).

## Background — existing code to build on

### Git Diff editor (the host of the new panel)

`src/renderer/editors/file-diff/FileDiffEditor.ts` — a **host-adopting** (`hasContentHost`)
editor surfaced via the editor switch for any text file in a git repo. Key existing pieces this
task reuses:
- **`from` / `to` are `RevSel`** (`FileDiffEditorState`): `{ kind: "unstaged" | "staged" | "head" | "commit"; hash?; shortHash? }`. `from` (left) is never `unstaged`.
- **`hasStaged: boolean`** in state — derived on adopt (`initDiffDefaults`); when false the pickers hide the "Staged" option. The panel uses the same flag to decide whether to show the Staged row.
- **`setFrom(sel)` / `setTo(sel)`** — already the public mutators the popovers call; the panel's L/R toggles call the same.
- **`repoRoot` / `relPath` / `language`** getters.
- **Two file-scoped commit-list models today:** `fromPicker` / `toPicker` (`GitTreeModel`), configured in `configureForRepo()` (called on adopt and when git detection lands), lazy-loaded via `ensureLoaded()` on popover open. **This task consolidates them into a single shared `fileTree` model** (Concern 3, resolved) — all three consumers (from popover, to popover, panel) render the same single-file history; selection is a render prop, not model state, so one model backs all three.
- **`adoptHost(host)`** is the single attach point (called by `switchFrom` and `restore`) — the right place to register the panel (mirrors `TodoEditor.adoptHost` setting `this.secondaryView = TODO_PANELS`).

### From/to popover (the thing the panel duplicates)

`src/renderer/editors/file-diff/RevisionPicker.tsx` + `index.tsx`:
- The popover renders endpoint **buttons** (`ENDPOINTS[side]` — `to`: Unstaged/Staged; `from`: Staged) above a `<GitTree compact … onSelectCommit={pickCommit}>`.
- Active endpoint uses `variant={value.kind === ep.kind ? "primary" : "ghost"}` — `primary` is the accent variant. **The panel's L/R active state reuses the same accent** (`color.primary.*`).
- `index.tsx` `FileDiffToolbarBits` currently wires `picker={model.fromPicker}` / `model.toPicker`. **This task rewires both sides to the single `picker={model.fileTree}`** (Concern 3). The endpoint **buttons** (Unstaged/Staged) stay as the popover's own UI above the grid — the shared model holds **only** the commit history; each view augments it with its own endpoint rows/buttons (the user's "merge common list with an additional item" — done at the view level, not in the model). The datetime column change itself lives entirely inside `<GitTree>`.

### Git Tree component (the filtered list renderer)

`src/renderer/components/git-tree/GitTree.tsx` — presentational `AVGrid` over a `GitTreeModel`.
- `buildColumns(maxColumns, compact)`:
  - `compact` (popover today) → `[graph, subject(240), hash(80)]`
  - non-compact (whole-repo editor) → `[graph, subject(360), author(140), date(160), hash(80)]`
  - **This task rewrites the `compact` branch to `[date, subject, hash]`** (no graph; date first, ~96px, resizable). Non-compact is untouched.
- `dateFormatter` / `dateText(ms)` already exist (`new Date(ms).toLocaleString()`), and there's already a `formatValue` for the non-compact date column — reuse both for the new compact date column.
- Columns are `useState` + `setColumns`, rebuilt only on structural change (`[maxColumns, compact]`) so user-dragged widths persist. **Do not rebuild columns on from/to change** (it would reset widths) — see Concern 2 for how the L/R column reacts to selection instead.
- `selectedHash` → highlights a row (`selected` Set passed to AVGrid). AVGrid re-renders visible cells whenever a prop like `selected` changes (the whole component re-renders on model prop change; `Cell` reads `model.props.selected`). This is the lever used to make L/R cells reflect the live `from`/`to` (Concern 2).
- `GIT_TREE_ROW_HEIGHT = 24` (from `BranchTreeCell`).

### AVGrid interactive cell pattern

`src/renderer/uikit/AVGrid/SelectColumn.tsx` is the precedent for an interactive control inside
a cell: a `cellRenderer` that reads live state from `model.props.*` and renders an `IconButton`,
calling `model.update({ rows: [...] })` to force a re-render after a click. The L/R column
follows the same shape (two toggles instead of one checkbox), but reads the current `from`/`to`
from a closure/ref captured by a `make…Cell(getSelection, onPickFrom, onPickTo)` factory
(mirroring `makeBranchTreeCell(maxColumns)`), since `from`/`to` are not AVGrid-native props.

### Secondary-view lifecycle — why this panel disappears on navigation/switch

[secondary-views.md](../../architecture/secondary-views.md) (§3, §4, §10):
- **Pattern B** (mainEditor registers itself as a sidebar panel). `EditorModel.beforeNavigateAway()` **default clears `secondaryView`** → the panel is removed when the editor stops being main. The Git Diff panel uses this **default** (does NOT override it) — so opening another file in the page removes the panel.
- **Editor switch** (`PageModel.switchMainEditor` → `setMainEditor`): `oldMain.beforeNavigateAway(newEditor)` runs (clears the panel), then the old editor isn't `contributesPanels()` → it's detached + disposed. So switching Git Diff → Text Editor removes the panel too. ✅ This is exactly the user's requirement.
- Contrast with `GitTreeEditorModel`, which overrides `beforeNavigateAway()` to a **no-op** for unconditional survival (US-616/617). **The Git Diff panel must NOT do that.**
- Registration mirrors `TodoEditor`: set `this.secondaryView = ["git-diff-revisions"]` inside `adoptHost()`. Restore re-runs `adoptHost` → panel re-registers, so app-restart with a Git Diff open restores the panel automatically (Pattern B dedup in `restoreSecondaryViews`). No bespoke persistence.

## Implementation plan

### 1. `GitTree.tsx` — datetime format change (everywhere) + filtered-list datetime column + optional L/R side-select

- **Change the git-history date format everywhere (Concern 5).** Replace `dateText(ms)` —
  currently `new Date(ms).toLocaleString()` — with a developer-friendly, zero-padded, **local-time**
  format `YYYY-MM-DD HH:mm` (24-hour, **no seconds** — saves space; a future details view may
  show full time). Since both the compact and non-compact date columns (and their `formatValue`)
  go through `dateText`, this one change updates the format in **all** git-history views
  (popovers, panel, and the whole-repo Git Tree editor). Helper:
  ```ts
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateText = (ms: number) => {
      if (!ms) return "";
      const d = new Date(ms);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
             `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  ```
- **Rewrite the `compact` branch of `buildColumns`** to `[dateCol, subject, hash]`:
  - `dateCol` = `{ key: "authorDate", name: "Date", width: 94, resizible: true, cellFormater: dateFormatter, formatValue: (_c, r) => dateText(r.authorDate) }`. No graph column in compact. Width **94px** shows the full `YYYY-MM-DD` date without ellipsis truncation; resizable to reveal the time.
  - Keep `subject` (compact width 240) and `hash` (80). **Non-compact branch unchanged** — its date column stays width 160, which fits the full `YYYY-MM-DD HH:mm` (16 chars ≈131px at Consolas 14px). Only the *format* changes there.
- **Add an optional `sideSelect` prop** to `GitTreeProps`:
  ```ts
  export interface GitTreeSideSelect {
      /** Hash currently on the LEFT (from), if from.kind === "commit". */
      fromHash?: string;
      /** Hash currently on the RIGHT (to), if to.kind === "commit". */
      toHash?: string;
      onPickFrom: (hash: string) => void;
      onPickTo: (hash: string) => void;
  }
  // GitTreeProps gains:  sideSelect?: GitTreeSideSelect;
  ```
- **When `sideSelect` is provided**, prepend an **L/R status column** (leading, sticky-left, `isStatusColumn: true`, fixed width ~`56`, not resizable) built via a `makeSideSelectCell(getSelection, onPickFrom, onPickTo)` factory (closure over a **ref** holding the latest `sideSelect`, refreshed each render — like `makeBranchTreeCell`). The cell renders the shared `<SideSelectToggle>` (step 2) for the row's commit hash. See Concern 1 for column-order rationale (status column leads even though the date is the first *content* column).
- **Reactivity (Concern 2 — RESOLVED):** GitTree holds a `useRef<AVGridModel>()` passed as `<AVGrid ref={…}>` (AVGrid is `forwardRef` and exposes its model). A `useEffect` keyed on `[sideSelect?.fromHash, sideSelect?.toHash]` calls `gridRef.current?.update({ columns: [0] })` — re-rendering **only column 0** (the L/R status column) across all visible rows, leaving the date/subject/hash cells untouched. The L/R cellRenderer reads the live `from`/`to` from the ref captured by `makeSideSelectCell`. (No `selected`-Set fold, no full-grid re-render.) Row-click does nothing in `sideSelect` mode (omit/ignore `onSelectCommit`) — the toggles are the only pick mechanism.

### 2. `SideSelectToggle.tsx` (new, in `components/git-tree/`) — shared L/R toggle pair

- A small presentational component: two square toggle buttons labeled **L** and **R**.
  ```ts
  interface SideSelectToggleProps {
      name?: string;
      leftActive: boolean;
      rightActive: boolean;
      showLeft?: boolean;       // default true. Unstaged row passes false → renders the R toggle ONLY
      onPickLeft: () => void;
      onPickRight: () => void;
  }
  ```
  The **Unstaged** endpoint row passes `showLeft={false}` so **only the R icon renders** (from is never `unstaged` — user decision). Keep the R icon horizontally aligned with the other rows' R (reserve the L slot's width when hidden) so the column reads cleanly.
- Active = accent background (`color.primary.background` / `color.primary.text`); inactive = ghost. Follow uikit conventions (Rule 1 `data-*`; `data-active` for the active toggle). Built from UIKit primitives (`IconButton`/`Button` with `variant="primary"|"ghost"`, or a small styled pair — `components/` allows Emotion). Reused by both the GitTree L/R column (step 1) and the panel's endpoint rows (step 3).
- Export from `components/git-tree/index.ts`.

### 3. `GitDiffRevisionsSecondaryView.tsx` (new, in `editors/file-diff/`) — the panel

- `export default function GitDiffRevisionsSecondaryView({ model, headerRef }: SecondaryViewProps)` — type-guard `model instanceof FileDiffEditor` (same shape as `GitChangesSecondaryView`), then render a body.
- Subscribe to `model.state` (`from`, `to`, `hasStaged`) and `model.fileTree.state` (commits).
- **Header** (portaled into `headerRef`): title `File History` (panel id stays `git-diff-revisions`) + a Refresh `IconButton` (calls `model.refreshPanel()` — reloads `fileTree` + re-derives `hasStaged`). **No close "x"** (Concern 4): the panel is bound to the Git Diff being the main editor and auto-removes on navigation/switch.
- **Endpoint rows** (top, fixed): render with the shared `<SideSelectToggle>`:
  - **Unstaged** — `showLeft={false}` (R icon only; from never unstaged); R active when `to.kind === "unstaged"`; `onPickRight` → `model.setTo({ kind: "unstaged" })`.
  - **Staged** — only when `hasStaged`. L active when `from.kind === "staged"`; R active when `to.kind === "staged"`; pick → `setFrom`/`setTo({ kind: "staged" })`.
- **Commit list** (fills the rest): `<GitTree compact model={model.fileTree} sideSelect={{ fromHash: from.kind==="commit"?from.hash:undefined, toHash: to.kind==="commit"?to.hash:undefined, onPickFrom: h => model.setFrom({kind:"commit",hash:h,shortHash:h.slice(0,7)}), onPickTo: h => model.setTo({kind:"commit",hash:h,shortHash:h.slice(0,7)}) }} />`.
- Layout via UIKit `Panel` (column flex; the `flex={1} height={0}` filler pattern around `<GitTree>` as in `RevisionPicker`). No Emotion in the panel (it's editor code, Rule 7).

### 4. `FileDiffEditor.ts` — consolidate to one `fileTree` model + registration + refresh

- **Consolidate (Concern 3):** replace `fromPicker` + `toPicker` with a single
  `readonly fileTree = new GitTreeModel();`. It backs both popovers and the panel (selection is
  a render prop, so one model serves all three).
- `configureForRepo()` configures the one model: `this.fileTree.configure(this.repoRoot, this.relPath)` and `void this.fileTree.reload()` (eager — the panel is visible as soon as the diff opens; the popovers' lazy `ensureLoaded()` then finds it already loaded). `initDiffDefaults()` still runs.
- In `adoptHost(host)`, after configuring, set `this.secondaryView = ["git-diff-revisions"];` (Pattern B; mirrors `TodoEditor`). **Do not override `beforeNavigateAway`** — the default clears the panel on navigation/switch (the requirement).
- Add `refreshPanel = (): void => { this.fileTree.configure(this.repoRoot, this.relPath); void this.fileTree.reload(); void this.initDiffDefaults(); }` for the header Refresh (also re-derives `hasStaged`).
- In `dispose()`, replace the two `*.dispose()` calls with `this.fileTree.dispose();`.
- **Update `index.tsx`** `FileDiffToolbarBits`: both `<RevisionPicker side="from" picker={model.fileTree} …>` and `side="to" picker={model.fileTree}`.

### 5. `register-editors.ts` — register the panel id

```ts
secondaryViewRegistry.register({
    id: "git-diff-revisions",
    label: "File History",
    loadComponent: () => import("./file-diff/GitDiffRevisionsSecondaryView"),
});
```

### 6. Exports / docs

- `components/git-tree/index.ts` — export `SideSelectToggle` + `GitTreeSideSelect` type.
- Docs (completion stage): `secondary-views.md` §10 — add a `FileDiffEditor → ["git-diff-revisions"]` row noting **default `beforeNavigateAway` (removed on navigation AND editor-switch)** to contrast with `GitTreeEditorModel`'s unconditional survival. `CLAUDE.md` Key Files — add the new panel component + `SideSelectToggle` if warranted.

## Concerns / open questions — for user review

1. **L/R column placement — RESOLVED (user decision).** L/R is the **first column**, with
   **`isStatusColumn: true`** so it is fixed-width, **not resizable, not reorderable, and sticky
   at the left edge** (always visible regardless of horizontal scroll). Column order in the
   panel is `[L/R] [Date] [Comment] [Commit]`; the datetime is the first *content* column. The
   popovers (no `sideSelect`) keep `[Date] [Comment] [Commit]` with date genuinely first.
2. **AVGrid reactivity for the live L/R state — RESOLVED (user decision).** `from`/`to` aren't
   AVGrid-native props, and rebuilding columns on every selection change would reset
   user-dragged widths. **Plan:** the L/R `cellRenderer` reads the latest selection from a ref
   captured by `makeSideSelectCell`; GitTree holds a `useRef<AVGridModel>()` (AVGrid is
   `forwardRef`, exposing its model via `useImperativeHandle`) and a `useEffect` keyed on
   `[fromHash, toHash]` calls `gridRef.current?.update({ columns: [0] })` — re-rendering **only
   the L/R status column** (column 0) across all rows, not the whole grid. `RerenderInfo.columns`
   is `Array<number>` (column indices); `AVGridModel.update` → `RenderGridModel.update` is the
   existing, intended API for this (no `selected`-Set abuse, no column rebuild).
3. **One panel model vs. reusing the pickers — RESOLVED (user decision): consolidate now.**
   Replace `fromPicker` + `toPicker` with a single shared `fileTree` `GitTreeModel` on the
   FileDiffEditor, backing both popovers and the panel. All three render the same single-file
   history; selection is a render prop (`selectedHash` / `sideSelect`), not model state, so one
   model is correct and avoids redundant `git log` work. Endpoint **items** that aren't commits
   (Unstaged/Staged) are **not** merged into the shared model — each view adds them as its own
   rows/buttons above the grid (e.g. the "to" popover's Unstaged button exposes the editable
   working-tree version on the right/modified side; Monaco's diff allows editing the right side
   only).
4. **Manual close button on the panel — RESOLVED (user decision): no close button.** The panel
   is visible exactly while the Git Diff is the main editor and auto-removes on
   navigation/editor-switch. Header = title + Refresh only.
5. **Datetime initial width / formatting — RESOLVED (user decision).** Change the git-history
   date format **everywhere** (compact + non-compact) from `toLocaleString()` to a developer
   format `YYYY-MM-DD HH:mm` (24-hour, local time, **no seconds**). The compact date column is **94px**
   (shows the full `YYYY-MM-DD` without ellipsis — resizable to reveal the time); the non-compact
   editor column keeps 160px (fits the full string).
6. **`hasStaged` freshness in the panel — RESOLVED (user decision): manual Refresh.** The panel
   header's **Refresh** button (`model.refreshPanel()`) reloads the `fileTree` **and** re-derives
   `hasStaged` (re-running `initDiffDefaults`), so the Staged row appears/disappears on demand.
   No auto file-watch this increment — consistent with the popovers today.

## Acceptance criteria

- **Date format (all git-history views):** commit dates render as `YYYY-MM-DD HH:mm`
  (24-hour, local time, no seconds) — in the popovers, the panel, **and** the whole-repo Git Tree editor.
- **Filtered list (popovers + panel):** the file-scoped Git Tree shows **no graph**; the first
  content column is **commit datetime** (94px initial, showing `YYYY-MM-DD`, resizable to reveal
  the time). The **whole-repo Git Tree editor still shows the graph** (unchanged) and its date
  column still shows the full datetime.
- **Panel appears** in the sidebar whenever a **Git Diff** is the main editor (and the sidebar
  is open), showing the file's filtered commit list plus an **Unstaged** row and (only when the
  file has staged changes) a **Staged** row.
- **Panel disappears** when the page navigates to another file **and** when the user switches the
  Git Diff back to the Text Editor (or any other editor). It never lingers as an orphan panel.
- **L/R toggles** on every row (endpoint rows + commits) reflect the editor's current comparison:
  the `from` row shows **L** active (accent), the `to` row shows **R** active. The **Unstaged**
  row's **L** is disabled/hidden (from is never unstaged).
- **Clicking L/R** sets that side via `setFrom`/`setTo` — the Monaco diff updates and the toolbar
  from/to popover labels stay in sync (shared state). The active L/R highlight updates live.
- App compiles (`tsc --noEmit`) and lints clean; **"Git integration" off → no Git Diff editor, no panel** (unchanged gating).

## Files to change (planned)

| File | Change |
|------|--------|
| `src/renderer/components/git-tree/swimlane-layout.ts` | + `recordType` ("commit"/"unstaged"/"staged") on `GitCommitRow`; + `syntheticCommitRow()` helper for the endpoint rows |
| `src/renderer/components/git-tree/GitTree.tsx` | `compact` columns → `[date, subject, hash]` (drop graph); add optional `sideSelect` (row-aware predicates + `selectionKey`) + leading L/R status column via `makeSideSelectCell`; add `leadingRows` (synthetic endpoint rows); synthetic-subject muted/italic |
| `src/renderer/components/git-tree/SideSelectToggle.tsx` | **New** — shared L/R toggle pair (accent-active), reused by the L/R column and the panel's endpoint rows |
| `src/renderer/components/git-tree/index.ts` | Export `SideSelectToggle` + `GitTreeSideSelect` |
| `src/renderer/editors/file-diff/GitDiffRevisionsSecondaryView.tsx` | **New** — the "Revisions" panel (endpoint rows + filtered commit list + L/R) |
| `src/renderer/editors/file-diff/FileDiffEditor.ts` | Consolidate `fromPicker`+`toPicker` → single `fileTree`; configure/reload it in `configureForRepo`; register `secondaryView = ["git-diff-revisions"]` in `adoptHost`; `refreshPanel()`; dispose `fileTree`. Keep the **default** `beforeNavigateAway` |
| `src/renderer/editors/file-diff/index.tsx` | `FileDiffToolbarBits` — wire both pickers to `model.fileTree` |
| `src/renderer/editors/register-editors.ts` | Register the `git-diff-revisions` panel |
| `src/renderer/ui/app/Pages.tsx` | **Regression fix (found in testing):** key the main editor view `<RenderEditor key={editor.id}>` so same-type navigation (Git Diff A→B, Monaco A→B) remounts instead of reusing the component with a new `model` prop |
| `doc/architecture/secondary-views.md` | §10 — add the `FileDiffEditor` panel row (removed-on-navigation-and-switch) |
| `CLAUDE.md` | Key Files — add the new panel component / `SideSelectToggle` if warranted |

## Implementation note — endpoint rows moved into the grid (2026-06-09, user request)

The Unstaged/Staged endpoints were initially rendered as separate UI **above** the grid; the
user found that unintuitive and asked for them to be **rows in the table**. Implemented via a
`recordType: "commit" | "unstaged" | "staged"` discriminator on `GitCommitRow` +
`syntheticCommitRow(recordType, subject)`. The panel passes them as `GitTree.leadingRows`
(Unstaged always; Staged only when `hasStaged`). Synthetic rows show an empty Date/Commit cell
(`authorDate: 0` → blank via `dateText`; `shortHash: ""`) and a muted/italic label in the Comment
cell. `GitTreeSideSelect` became row-aware (`showLeft/isLeftActive/isRightActive/onPickLeft/
onPickRight` all take the row; `selectionKey` drives the column-0 repaint) so the diff-specific
RevSel mapping lives in the panel and `GitTree` stays generic. The popovers are unchanged (they
keep their endpoint buttons; no `leadingRows`/`sideSelect`).

## Implementation note — main-editor remount regression (2026-06-09, found in testing)

**Symptom:** after opening a Git Diff for one changed file, clicking a *different* changed file
in the "Changes" panel showed the new file's tab but kept the **previous** file's diff content.
Same root cause as a long-standing Monaco issue (scroll position persisting when switching files).

**Root cause:** `navigatePageTo` builds a **new** editor model (new `id`) per file via
`createEditorFromFile`, but the view chain `RenderEditor → NativeEditor → AsyncEditor` rendered
`<EditorModule.Editor model={model} />` keyed only by editor **type** (`cacheKey={editorId}`).
Navigating to a new file of the same editor type reused the component instance with a new
`model` prop, so the body model (`useComponentModel`) and Monaco/DiffEditor internal state never
rebuilt.

**Fix:** `Pages.tsx` keys the main editor view by the model **instance** id:
`<RenderEditor key={editor.id} model={editor} />`. A genuine model change (navigation) remounts;
an editor-type switch (which preserves the id) does not — that swap is handled by `AsyncEditor`'s
module cache. This restores the original Persephone design (editor view keyed by model id) that
had regressed. Broader than US-618 but required for the panel's "click another file" flow.

## Files that need NO change

- `RevisionPicker.tsx` — unchanged: it just forwards its `picker` prop to `<GitTree compact>`; the datetime-column change is internal to `GitTree`, and there's no L/R in popovers. (Only its caller `index.tsx` changes, to pass the shared `fileTree`.)
- `GitTreeModel.ts` — already supports file-scoped (`configure(repoRoot, relPath)`) loading; the panel reuses it.
- Backend git layer (`git-service.ts`, `git-ipc.ts`, `git.ts`) — no new git operations; `git.log` file-scoped is already used.
- `PageModel.ts` / `EditorModel.ts` — the default Pattern B lifecycle already gives the required "remove on navigation/switch" behavior.
