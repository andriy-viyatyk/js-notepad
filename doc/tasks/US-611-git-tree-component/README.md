# US-611: Git Tree component (AVGrid + SVG `BranchTreeCell` + swimlane layout)

**Epic:** [EPIC-030 — Git Integration](../../epics/EPIC-030.md)
**Status:** Implemented & verified (2026-06-06) — typecheck + full `npm run lint` clean; render/layout/selection/resize confirmed via the Storybook **Git → GitTree** story (synthetic DAG). The real-git `git.log` path is wired and typechecks but is first exercised end-to-end in US-612. Epic-deferred: stays `[ ]` on the dashboard until EPIC-030 close-out runs `/review` + `/document` + `/userdoc`.

### Post-implementation tweaks (user feedback, 2026-06-06)
- **Lane width 14 → 12px** (`LANE_WIDTH` in `BranchTreeCell.tsx`) — tighter graph.
- **Resizable columns.** Columns are now held in `useState` and `setColumns` is passed to AVGrid (the resize handler is a no-op without it), plus `resizible: true` on every column. Rebuilt (widths reset) only when the structure changes (compact toggled / `maxColumns` shifts).
- **Ref labels colored by kind.** `GitCommit.refs` is now `GitRef[]` (`{ name, kind }`, `kind ∈ head|branch|remote|tag`) instead of `string[]` — `parseDecorations` keeps the prefix info it used to strip. `GitTree.tsx` renders each ref as a colored chip (text + `currentColor` border), mapping kind → a `TAG_COLORS` entry by name: branch = Dodger Blue, remote = Cornflower Blue, tag = Hot Pink, HEAD/current branch = Lime Green. Chip border is neutral (`color.border.default`); only the text is kind-colored. Still palette-sourced (theme-safe, no raw hardcodes).
**Depends on:** US-610 (git service + IPC + `git.enabled` setting + renderer `git` API) — **done**.
**Consumed by:** US-612 (Git Tree editor mounts the component) and US-613 (File Diff commit-picker popover reuses it).

---

## Goal

Build the **reusable Git Tree component** — an `AVGrid` whose first column is a custom **SVG `BranchTreeCell`** that paints a commit history graph (swimlanes), with the remaining columns showing subject / author / date / short hash. The graph layout is produced by a **ported VS Code swimlane algorithm** (Concern 6 / D7, MIT). This is the shared building block both v1 git editors render; US-611 ships it **plus the `git log` data layer that feeds it**, verified standalone via a Storybook story.

---

## Background — what already exists (US-610) and what to build on

### The git foundation from US-610 (extend, do not duplicate)

| Layer | File | Current state |
|-------|------|---------------|
| Shared DTOs | `src/ipc/git-ipc.ts` | `GitProbeResult`, `GitRepoInfo`. **Add `GitCommit`, `GitLogOptions` here.** |
| Main service | `src/main/git-service.ts` | `probeGit()`, `detectRepo(dir)` (uses `simpleGit`). **Add `log(dir, opts)`.** |
| Endpoint enum + Api map | `src/ipc/api-types.ts:62` / `:125` | `gitProbe`, `gitDetectRepo`. **Add `gitLog`.** |
| Main controller | `src/ipc/main/controller.ts:243` | `gitProbe`, `gitDetectRepo` handlers; bound in `init()` at `:316`. **Add `gitLog` handler + `bindEndpoint`.** |
| Renderer IPC client | `src/ipc/renderer/api.ts:246` | `gitProbe()`, `gitDetectRepo(dir)` via `executeOnce`. **Add `gitLog`.** |
| Renderer git API | `src/renderer/api/git.ts` | `git.detectRepoForFile()`, `git.probe()`; per-dir cache; gated by `settings.get("git.enabled")`. **Add `git.log(repoRoot, opts)`.** |

The request/response IPC pattern (one `event.reply(\`${command}_${commandId}\`)`) is locked from US-610 — `gitLog` copies `gitDetectRepo` exactly.

### AVGrid (the grid engine) — `src/renderer/uikit/AVGrid/`

- **Component:** `<AVGrid columns={Column[]} rows={R[]} getRowKey rowHeight selected setSelected onClick .../>` (`AVGrid.tsx`, props in `model/AVGridModel.ts:26`). Wiring reference: `src/renderer/editors/grid/GridBody.tsx:129`.
- **Custom cell renderer:** `Column.cellRenderer?: TCellRenderer` (`avGridTypes.ts:98`). `TCellRendererProps extends RenderCellParams { model; className? }` (`avGridTypes.ts:42`) — gives the cell its `row`/`col` index, the absolute-positioned `style`, and the `model` (so it can read `model.data.rows[row]`). The `Cell` dispatcher (`AVGrid.tsx:193`) renders `columns[col].cellRenderer ?? DataCell` for data rows and shifts the row index by −1 (row 0 is the header). **A custom `cellRenderer` fully replaces `DataCell`** — it does **not** inherit `DataCell`'s `.data-cell` root, so `BranchTreeCell` must apply `props.style` to its own root, set `overflow: hidden`, and forward `props.className` (carries `row-selected` / `row-hovered`, whose `::before`/`::after` overlays in `AVGrid.tsx:66`/`:78` then light up).
- **Precedent for a component cellRenderer:** `SelectColumn.tsx:108` sets `cellRenderer: DataCell`; `DataCell.tsx` shows complex cells (IconButtons, conditionals). No SVG-in-cell precedent yet — `BranchTreeCell` is the first, but follows the same shape.
- **Cell box & clipping:** each cell `style` is `position:absolute; left; top; width(=column width); height(=rowHeight)` (`RenderGrid/renderInfo.ts`). So the SVG can be drawn at a **constant `requiredWidth` wider than the column** and `overflow:hidden` on the cell root clips it — exactly the Concern 9 design (shrinking the column slides the clip edge; never rescales the graph).
- **Column width:** `Column.width?: number` is the initial pixel width; resize persists back via `setColumns` (`model/ColumnsModel.ts:34`/`:48`). Default `rowHeight` is **140** — far too tall; we **must** pass an explicit compact `rowHeight`.

### Storybook (verification path) — `src/renderer/editors/storybook/`

Stories are **manually registered**: each `*.story.tsx` exports a `Story` object, imported and pushed into `ALL_STORIES` in `storyRegistry.ts:47`. They currently all happen to be `uikit/` components, but the registry is just imports — a story importing from `components/git-tree/` registers identically. **This is how an otherwise-unwired US-611 component gets visually verified** before US-612 exists.

### Color system — `src/renderer/theme/color.ts` + `themes/*.ts`

`color.ts` exposes nested CSS-var groups (`color.grid.*`, `color.graph.*`, …); each `themes/<name>.ts` defines the raw values. **But the lane palette does NOT go here** (see Decision E). Cycling identity palettes live in **`src/renderer/theme/palette-colors.ts`** — `TAG_COLORS` is an 11-entry array (`{ name, hex }`) of named CSS colors chosen to read on both dark *and* light themes, already shared by todo tags and browser profiles. US-611 reuses it for lanes — no `color.gitGraph` group, no per-theme edits. (`color.graph.*` is the node-graph editor's palette — unrelated; leave it alone.)

### The swimlane algorithm — VS Code `scmHistory.ts` (MIT, D7)

Source: `toISCMHistoryItemViewModelArray` in [`scmHistory.ts`](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/contrib/scm/browser/scmHistory.ts). Per-commit it computes `inputSwimlanes` / `outputSwimlanes` arrays of `{ id: parentHash, color }`. Newest→oldest:

1. `inputSwimlanes` = deep clone of the previous row's `outputSwimlanes`.
2. Walk input lanes; the **first** lane whose `id === commit.hash` is the **node column**. Replace it with a lane reserving the commit's **first parent**, keeping (or overriding from a ref) its color — *first parent keeps the lane*. Other input lanes also reserving this commit are **dropped** (merge-in collapses). Lanes reserving other commits pass through unchanged.
3. For each **extra parent** (parents[1..]): reuse an existing output lane already reserving that parent, else append a new lane with the next palette color (`colorIndex = rot(colorIndex+1, palette.length)`).
4. A **root** commit (no parents) simply drops its lane (no output added for it).

Palette: VS Code ships 5 colors and cycles them; we instead cycle the shared **`TAG_COLORS`** (11, dual-theme — Decision E). Render mapping: vertical `<line>` where a lane's column is unchanged top→bottom; `<circle>` node at the node column; diagonal `<path>` where a lane changes column (branch-out below the node center, merge-in above). Input lanes occupy the top half (y 0→rowHeight/2), output lanes the bottom half (rowHeight/2→rowHeight); x of lane *i* = `i*laneWidth + laneWidth/2`.

---

## Design decisions (resolved in this investigation)

| # | Decision | Rationale |
|---|----------|-----------|
| **A** | Component lives in **`src/renderer/components/git-tree/`** | It is a **persephone-coupled reusable composite** (depends on the `git` renderer API) consumed by *two* editors — exactly the `components/` criterion ("depends on `app.*` APIs / fs / scripting"). Not a pure primitive → not `uikit/`. Not inside one editor's folder → both editors import it cleanly. |
| **B** | US-611 **includes the `git log` data layer** (DTO + `gitLog` endpoint + `git.log()`), not just the view | Makes the component self-contained and demonstrable (the story feeds synthetic data; a future real mount feeds `git.log`). Avoids US-612 having to invent the data shape the component already dictates. |
| **C** | The component is **presentational** — takes `commits: GitCommit[]` + selection props; runs the layout pass internally (memoized). The layout pass is a **separate pure function** | US-612 (whole-repo `git log`) and US-613 (single-file `git log --follow -- <path>`) need **different queries** — the caller fetches, the component renders. Pure layout fn = unit-testable and story-feedable without git. |
| **D** | Verify standalone via a **`GitTree.story.tsx`** (synthetic DAG) registered in `storyRegistry.ts`; real-git verification lands with US-612 | Only way to see the swimlanes render before any editor wires it; the story doubles as permanent regression coverage of the layout edge cases. |
| **E** | Use the shared **`TAG_COLORS` palette** (`theme/palette-colors.ts`, 11 dual-theme colors) for lanes — **one set for all themes, no per-theme CSS vars**. Same source todo tags / browser profiles already use. Nodes take their lane color; ref tags reuse existing neutral tokens. | Swimlane colors **cycle** and are *identity* colors, not theme-chrome — a lane looks the same in every theme, so they belong in the shared named palette, not per-theme tokens. 11 > VS Code's 5 → fewer adjacent-lane collisions; zero 10-theme-file churn. |

---

## Implementation plan

### Step 1 — DTOs: `src/ipc/git-ipc.ts`

Add below the existing interfaces:

```ts
/** Options for a `git log` query. */
export interface GitLogOptions {
    /** Cap on commits returned (Concern 7 — simple bounded load). Default 500. */
    maxCount?: number;
    /** Limit history to a single file (repo-relative or absolute), via `--follow`. */
    file?: string;
}

/** One commit row from `git log --topo-order --parents`. */
export interface GitCommit {
    /** Full 40-char hash. */
    hash: string;
    /** Abbreviated hash for display (first 7). */
    shortHash: string;
    /** Parent hashes in order — parents[0] is the first parent. */
    parents: string[];
    /** First line of the commit message. */
    subject: string;
    authorName: string;
    /** Commit (author) date as epoch ms. */
    authorDate: number;
    /** Decoration refs at this commit (branch/tag/HEAD names), if any. */
    refs: string[];
}
```

### Step 2 — Main service: `src/main/git-service.ts`

Add a `log` function. Use a unit-separator pretty format so subjects with any punctuation parse safely:

```ts
/**
 * Capped commit history for a repo (newest first, topo-ordered so a parent
 * never precedes all its children). Optionally scoped to one file (--follow).
 * Never throws — returns [] when git is unavailable or dir is not a repo.
 */
export async function log(dir: string, opts: GitLogOptions = {}): Promise<GitCommit[]> {
    const max = opts.maxCount ?? 500;
    // %x1f = unit separator (field), %x1e = record separator (commit).
    const FORMAT = ["%H", "%P", "%s", "%an", "%at", "%D"].join("%x1f") + "%x1e";
    try {
        const git = simpleGit(dir);
        const args = [
            "log", "--topo-order", "--parents",
            `--max-count=${max}`, `--pretty=format:${FORMAT}`,
        ];
        if (opts.file) args.push("--follow", "--", opts.file);
        const raw = await git.raw(args);
        return parseLog(raw);
    } catch {
        return [];
    }
}
```

`parseLog` (module-private): split on `\x1e`, drop blanks, split each record on `\x1f` into `[hash, parentField, subject, authorName, at, decorations]`; `parents = parentField.trim() ? parentField.trim().split(" ") : []`; `shortHash = hash.slice(0,7)`; `authorDate = Number(at) * 1000`; `refs = parseDecorations(decorations)` (split `%D` on `, `, strip `HEAD -> `, `tag: `, drop empties). **Note:** `--parents` prepends parent hashes to the line *as well as* in `%P`; using `%H%x1f%P` we read parents from `%P` and ignore the `--parents` prefix — simplest is to **drop `--parents`** and rely solely on `%P` (which lists all parents). Keep `--topo-order`. _(Implementer: verify `%P` alone suffices; it does — `--parents` is redundant with `%P`. Final: omit `--parents`.)_

### Step 3 — IPC plumbing (3 files, copy the `gitDetectRepo` shape)

- `src/ipc/api-types.ts`: import `GitCommit, GitLogOptions`; add `gitLog = "gitLog"` to `enum Endpoint`; add to `Api`:
  ```ts
  [Endpoint.gitLog]: (dir: string, opts: GitLogOptions) => Promise<GitCommit[]>;
  ```
- `src/ipc/main/controller.ts` (after `gitDetectRepo`, ~`:251`):
  ```ts
  gitLog = async (_event: IpcMainEvent, dir: string, opts: GitLogOptions) => {
      const { log } = await import("../../main/git-service");
      return log(dir, opts);
  };
  ```
  and in `init()` (after `:317`): `bindEndpoint(Endpoint.gitLog, controllerInstance.gitLog);`
- `src/ipc/renderer/api.ts` (after `gitDetectRepo`, ~`:251`): import the DTOs; add
  ```ts
  gitLog = async (dir: string, opts: GitLogOptions = {}) => {
      return executeOnce<GitCommit[]>(Endpoint.gitLog, dir, opts);
  };
  ```

### Step 4 — Renderer git API: `src/renderer/api/git.ts`

Add (gated by the setting, like the others — no cache; history changes between calls):

```ts
import type { GitRepoInfo, GitProbeResult, GitCommit, GitLogOptions } from "../../ipc/git-ipc";

// inside the `git` object:
/** Commit history for a repo root (optionally one file). Empty when git off/unavailable. */
log(repoRoot: string, opts: GitLogOptions = {}): Promise<GitCommit[]> {
    if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve([]);
    return api.gitLog(repoRoot, opts).catch((): GitCommit[] => []);
},
```

### Step 5 — Lane palette: reuse `TAG_COLORS` (no theme edits)

**No `color.ts` group, no per-theme `*.ts` edits.** Lane colors come from the shared dual-theme palette:

```ts
import { TAG_COLORS } from "../../theme/palette-colors";
const LANE_COLORS = TAG_COLORS.map((c) => c.hex);   // 11 cycling lane colors
```

`toCommitRows()` (Step 6) receives `LANE_COLORS` and assigns/cycles them; the node circle uses its lane's color (`row.node.color`). **Ref tags** (branch/tag/HEAD labels in the subject cell) are not lane-colored — they reuse existing theme tokens (e.g. `color.background.light` bg + `color.text.default`), so they stay theme-aware. No new color token is introduced anywhere.

> Using named CSS colors via `TAG_COLORS` is **not** a "no hardcoded colors" violation — it's the sanctioned shared-palette pattern already used by todo tags and browser profiles (`palette-colors.ts` is the designated home for theme-agnostic identity palettes). If >11 simultaneous distinct colors are ever wanted, extend `TAG_COLORS` there.

### Step 6 — Layout pass (pure): `src/renderer/components/git-tree/swimlane-layout.ts`

Port `toISCMHistoryItemViewModelArray`. Exports:
```ts
export interface GitLane { id: string; color: string; }   // id = the parent hash this lane reserves
export interface GitCommitRow {
    commit: GitCommit;
    node: { column: number; color: string };
    inputSwimlanes: GitLane[];
    outputSwimlanes: GitLane[];
}
/** @param commits newest→oldest (as returned by git.log). @param laneColors palette array. */
export function toCommitRows(commits: GitCommit[], laneColors: string[]): GitCommitRow[];
```
Algorithm exactly as the Background section (input = prev output; first matching lane = node column; first parent keeps lane + color; drop other lanes reserving this commit; extra parents reuse-or-append lanes cycling `laneColors`; root drops its lane). Include the MIT attribution comment header (mirror `default-dark.ts`'s header style).

### Step 7 — SVG cell: `src/renderer/components/git-tree/BranchTreeCell.tsx`

A `TCellRenderer`. Reads `const r = model.data.rows[props.row] as GitCommitRow`. Renders a root `<div style={props.style} className={clsx("git-graph-cell", props.className)}>` with `overflow:hidden`, containing an `<svg width={requiredWidth} height={ROW_HEIGHT}>` where `requiredWidth = maxLanes*LANE_WIDTH + PAD` (maxLanes passed via a prop/context computed once from all rows). Draw per Background mapping:
- pass-through input lane *i* (its id appears in output at column *j*): `<line>` (i→center) then continues; if `i===j` straight vertical, else diagonal `<path>`.
- node: `<circle cx={col*LANE_WIDTH + LANE_WIDTH/2} cy={ROW_HEIGHT/2} r={NODE_R}>` filled `r.node.color`.
- output lanes from node center → bottom (branch-out diagonals for new lanes).
Constants (proposed, tune in story): `ROW_HEIGHT=24`, `LANE_WIDTH=14`, `NODE_R=4`, `PAD=6`. Lane color comes from each `GitLane.color` / `node.color` (hex strings from `TAG_COLORS`, assigned by the layout pass).

### Step 8 — The component: `src/renderer/components/git-tree/GitTree.tsx` (+ `index.ts`)

```tsx
export interface GitTreeProps {
    name?: string;
    commits: GitCommit[];
    selectedHash?: string;
    onSelectCommit?: (hash: string) => void;
    /** Hide non-graph columns for the compact File-Diff popover (US-613). Default false. */
    compact?: boolean;
}
```
Inside: `const LANE_COLORS = TAG_COLORS.map(c => c.hex);` → `const rows = useMemo(() => toCommitRows(commits, LANE_COLORS), [commits])` → `const maxLanes = useMemo(...)`. Build `columns: Column<GitCommitRow>[]`:
- graph column `{ key:"graph", name:"", width: maxLanes*LANE_WIDTH+PAD, resizible:true, cellRenderer: makeBranchTreeCell(maxLanes) }`
- `{ key:"subject", name:"Comment", width: 360 }` (cellFormater renders refs as small tags + subject)
- `{ key:"authorName", name:"Author", width:140 }`
- `{ key:"authorDate", name:"Date", width:140 }` (relative/local time formatter)
- `{ key:"shortHash", name:"Commit", width:80 }`
Render `<AVGrid columns={columns} rows={rows} getRowKey={r => r.commit.hash} rowHeight={ROW_HEIGHT} selected={selectedSet} onClick={r => onSelectCommit?.(r.commit.hash)} fitToWidth />`. `compact` → keep only graph + subject + shortHash. Wrap any cross-cutting CSS (`.git-graph-cell`) on the AVGrid via the editor host later; for the component itself styling stays inside `BranchTreeCell`/cell formatters.

> **UIKit Rule 7:** `components/git-tree/` is app code, not `uikit/`, so it may use Emotion/`styled` for its own elements (the SVG cell, ref tags) — but must pass only props (never `style`/`className`) to `AVGrid` and other UIKit primitives.

### Step 9 — Story: `src/renderer/components/git-tree/GitTree.story.tsx` + register

Export a `Story` (mirror `ListBox.story.tsx`). Build a **synthetic DAG** covering every layout case: linear run, a branch-out, a 2-parent merge, an octopus (3-parent) merge, parallel long-lived lanes, and the **root** commit. Render `<GitTree commits={fake} .../>` with click-to-select wired to local state. In `storyRegistry.ts`: `import { gitTreeStory } from "../../components/git-tree/GitTree.story";` and add `gitTreeStory` to `ALL_STORIES` (new section label, e.g. `"Git"`).

---

## Concerns / open questions — ALL RESOLVED (user, 2026-06-06)

Every decision below is confirmed; the plan above reflects them. Recorded for a fresh implementer:

- **A (placement): RESOLVED** — `src/renderer/components/git-tree/` (a 5th persephone-coupled folder under `components/`; fits the criterion as a git-API-coupled composite reused by two editors). Not `uikit/`, not inside a single editor.
- **B (data layer in US-611): RESOLVED** — include the `gitLog` endpoint + `GitCommit` DTO + `git.log()` here (Steps 1–4), so the component is self-contained and demonstrable; US-612/613 just call `git.log()`.
- **C (presentational): RESOLVED** — the component takes `commits` and renders (runs the layout pass internally); callers fetch. The layout pass is a separate pure function.
- **D (story verification): RESOLVED** — add `GitTree.story.tsx` (synthetic DAG) + a new "Git" Storybook section for standalone verification; real-git verification lands with US-612.
- **E (palette): RESOLVED** — reuse the shared `TAG_COLORS` (11 dual-theme colors, `palette-colors.ts`) for lanes; one set for all themes, no per-theme CSS vars. Cycling 11 beats VS Code's 5; the set is already proven on dark + light. _(Swimlane palettes cycle — no need for one-color-per-branch, so 11 is ample; the 31-color `two-theme-colors.ts` set is unnecessary.)_
- **F (sizing/columns): RESOLVED** — `ROW_HEIGHT=24`, `LANE_WIDTH=14`, `NODE_R=4`; default columns graph/subject/author/date/hash. Tunable in the story during implementation.

---

## Acceptance criteria

- [x] `git.log(repoRoot, opts)` returns parsed `GitCommit[]` (newest-first, with `parents`, `refs`) ; returns `[]` when `git.enabled` is off or the dir is not a repo (never throws). `gitLog` wired through `api-types.ts` → `controller.ts` → `renderer/api.ts`. _(Wired + typechecks; first end-to-end against a real repo in US-612.)_
- [x] `toCommitRows()` produces correct `inputSwimlanes`/`outputSwimlanes`/`node` for: linear, branch-out, 2-parent merge, 3-parent merge, parallel lanes, and root (verified via the story's synthetic DAG).
- [x] `BranchTreeCell` renders a continuous, theme-colored swimlane graph: vertical lanes align across rows, nodes sit on their lane, branch/merge diagonals connect correctly; the graph clips (not rescales) when the graph column is narrowed.
- [x] The `GitTree` Storybook story renders the synthetic history; clicking a row fires `onSelectCommit` and highlights the selection. Columns are resizable.
- [x] Lanes use the shared `TAG_COLORS` palette (no `color.gitGraph` group, no theme-file edits); ref labels are kind-colored from `TAG_COLORS`; lint clean (the `TAG_COLORS` reuse is the sanctioned shared-palette pattern, not a hardcode).
- [x] `npm run lint` and typecheck clean. App compiles & runs; nothing changes with `git.enabled` off (the component is only reachable from the Storybook editor in US-611).

---

## Files changed

| File | Change |
|------|--------|
| `src/ipc/git-ipc.ts` | Add `GitLogOptions`, `GitCommit` DTOs |
| `src/main/git-service.ts` | Add `log(dir, opts)` + `parseLog` |
| `src/ipc/api-types.ts` | Add `gitLog` to `Endpoint` + `Api` |
| `src/ipc/main/controller.ts` | Add `gitLog` handler + `bindEndpoint` |
| `src/ipc/renderer/api.ts` | Add `gitLog` client method |
| `src/renderer/api/git.ts` | Add `git.log(repoRoot, opts)` |
| `src/renderer/components/git-tree/swimlane-layout.ts` | **New** — ported VS Code lane-layout pass |
| `src/renderer/components/git-tree/BranchTreeCell.tsx` | **New** — SVG cell renderer |
| `src/renderer/components/git-tree/GitTree.tsx` | **New** — the component (AVGrid + columns) |
| `src/renderer/components/git-tree/index.ts` | **New** — public exports |
| `src/renderer/components/git-tree/GitTree.story.tsx` | **New** — synthetic-DAG story |
| `src/renderer/editors/storybook/storyRegistry.ts` | Register `gitTreeStory` (new "Git" section) |

### Files needing NO changes
- `src/renderer/theme/palette-colors.ts` — `TAG_COLORS` is **imported** for lane colors, not modified (Decision E). No `color.ts` or `themes/*.ts` edits at all.
- `src/renderer/uikit/AVGrid/**` — consumed via props only; custom `cellRenderer` is already a first-class extension point (no AVGrid edits).
- `src/renderer/editors/text/TextEditorModel.ts`, `TextFileIOModel.ts`, `PageToolbar.tsx` — US-610's detection/switch wiring is untouched; US-611 adds no editor.
- `register-editors.ts`, `editorRegistry.ts` — no editor registered in US-611 (that's US-612/US-613).
