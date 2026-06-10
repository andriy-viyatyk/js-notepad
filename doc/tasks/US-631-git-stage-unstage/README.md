# US-631: Git "Changes" panel — stage / unstage operations (+ `FileGrid`)

**Epic:** [EPIC-031: Git Functionality Enhancements](../../epics/EPIC-031.md)
**Status:** ✅ Done (2026-06-10) — tested; `/review` + `/document` + `/userdoc` complete. Stays listed under EPIC-031 until the epic closes (per the epic's per-task model).

## Goal

Add the **first mutating git operations** to the "Changes" secondary view: move selected file(s)
between the **Unstaged** and **Staged** lists, performing the real `git add` / `git reset` underneath.
Triggers:

1. **Toolbar arrow buttons** on the "Staged" panel header (a real toolbar: "Staged" label left, buttons
   right-aligned).
2. **Double-click** a file → moves it to the other list.
3. Both operate on the current **range selection**.

To get range selection (and Excel-style range-copy) we **replace the panel's `FileList` with a new
`FileGrid` component built on `AVGrid`** (decided 2026-06-10 — see "Multiselect decision" below).

## Background

### The "Changes" panel today

`src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` renders two `<ChangesList>` blocks (Unstaged
top, Staged bottom, separated by a horizontal `Splitter`). Each is a plain label `<Panel>` + a `<FileList>`:

```tsx
<Panel name="git-changes-section-label" padding="xs"><Text color="light">{label}</Text></Panel>
<FileList items={items} onClick={onClick} getTrailing={getTrailing} compact />
```

- `onClick` → `model.openChangeDiff(change)` (single click opens the Git Diff).
- `getTrailing` → `<GitStatusBadge>` (colored M/A/D/R/? badge).
- Data: `model.changes` (`GitChangesModel`), state `{ unstaged, staged, gitOk, loading }`,
  `GitFileChange[]`. `GitChangesModel.reload()` → `git.status(repoRoot)`.
- The Git Tree editor auto-refreshes on a working-tree watcher (US-624, debounced 500 ms), so the lists
  repaint after a mutation — but we still call `reload()` explicitly for immediate feedback.

### Backend — what exists, what's missing

All current git ops are **read-only**. EPIC-031 notes this epic introduces the **first mutating** git
operations. **Missing:** `stage(dir, paths)` / `unstage(dir, paths)` in `src/main/git-service.ts`, wired
through the IPC trio, then gated wrappers in `src/renderer/api/git.ts`.

A mutation that silently failed is worse than a read returning `[]`, so stage/unstage return
**`GitMutationResult { ok: boolean; error?: string }`** (never `throw` across IPC — `ok:false` lets the
renderer surface failure; the lists just won't move).

### IPC trio pattern (mirror `gitCommitFiles`, US-630)

1. `src/ipc/git-ipc.ts` — `GitMutationResult` DTO.
2. `src/ipc/api-types.ts` — `gitStage`/`gitUnstage` in `Endpoint` enum + `Api` signatures.
3. `src/ipc/main/controller.ts` — handlers (lazy-import) + `bindEndpoint`.
4. `src/ipc/renderer/api.ts` — `executeOnce` executors.
5. `src/renderer/api/git.ts` — gated wrappers.

> **⚠ Main-process HMR caveat (hit in US-629 + US-630):** new main-process IPC handlers require a **full
> app restart** — Vite HMR only reloads the renderer, so `executeOnce` hangs against an unbound handler.

### Multiselect decision — `AVGrid` via a new `FileGrid` (decided 2026-06-10)

Investigation confirmed `FileList`/`ListBox` has **no multiselect** and AVGrid's **turnkey** selection is
**range/focus selection, not individual-row picking** — which is exactly what we want here:

- **Range select is fine.** Start + end row define a contiguous range we can stage/unstage in one action
  (shift-click / click-drag / Ctrl+A). For non-contiguous files the user double-clicks them individually.
- **AVGrid gives this for free** via the controlled `focus`/`setFocus` props (`CellFocus`):
  `focus.selection.rowStart/rowEnd` → the selected row range. **Single + double click** are first-class
  (`onClick` / `onDoubleClick`). **Range-copy** is a bonus. `fitToWidth` resizes percent-width columns to
  the grid width (fixed-width columns stay fixed).

**→ Build a reusable `FileGrid` component** (a `FileList` replacement) on AVGrid, and use it in the Changes
panel. Per the "ship the new component, scope the swap" rule, **this task only swaps the Changes panel** to
`FileGrid`; the Recent-files panel keeps `FileList` for now (a later migration can move it). `FileGrid` is
designed to be that eventual replacement.

## Implementation plan

### Phase 1 — Backend: stage / unstage

`src/main/git-service.ts`:
```ts
export async function stage(dir: string, paths: string[]): Promise<GitMutationResult> {
    if (!paths.length) return { ok: true };
    try { await simpleGit(dir).add(paths); return { ok: true }; }      // add stages deletions + untracked too
    catch (e) { return { ok: false, error: String(e) }; }
}
export async function unstage(dir: string, paths: string[]): Promise<GitMutationResult> {
    if (!paths.length) return { ok: true };
    try { await simpleGit(dir).reset(["--", ...paths]); return { ok: true }; }  // ≡ reset HEAD -- <paths>
    catch (e) { return { ok: false, error: String(e) }; }
}
```
> **Edge cases:**
> - **No-HEAD repo** (no initial commit): `git reset -- <path>` fails (no HEAD). Unstage there needs
>   `git rm --cached -- <path>`. Detect + fallback, or accept the limitation for v1 — **Concern #3**.
> - **Renames** (`R`): status reports new `path` + `oldPath`. Pass **both** for renames so `add`/`reset`
>   follow the rename correctly.

DTO + IPC + gated wrappers as in the trio above. Signatures:
`(dir: string, paths: string[]) => Promise<GitMutationResult>`.

### Phase 2 — Model: `stagePaths` / `unstagePaths` on `GitChangesModel`

`src/renderer/components/git-tree/GitChangesModel.ts`:
```ts
stagePaths = async (paths: string[]): Promise<void> => {
    if (!this.repoRoot || !paths.length) return;
    const r = await git.stage(this.repoRoot, paths);
    if (!r.ok) app.ui.notify(`Failed to stage: ${r.error ?? "unknown error"}`, "error");  // Concern #6
    await this.reload();   // refresh whether or not it succeeded — shows the true state
};
// unstagePaths — symmetric (git.unstage; "Failed to unstage: …").
```
Callers expand a selected `GitFileChange` to `[path, ...(oldPath ? [oldPath] : [])]` for renames.

**Full stage / unstage (Concern #5 — matches Git Extensions).** `git add <path>` / `git reset <path>`
operate on the **whole path**, not per-hunk — so for a partially-staged file (present in *both* lists after
being staged, then edited again): double-clicking its **Unstaged** row runs `git add` → the file becomes
**fully staged**; double-clicking its **Staged** row runs `git reset` → **fully unstaged**. This falls out
of the plain path-level ops — no special handling needed.

### Phase 3 — New `FileGrid` component (AVGrid-based)

**New folder:** `src/renderer/components/file-grid/` (`FileGrid.tsx` + `index.ts`). Lives in `components/`
(coupled to `FileIcon`), so Emotion/`styled` is allowed here.

**Item shape + props:**
```ts
export interface FileGridItem {
    filePath: string;   // unique row key + FileIcon source + tooltip
    title: string;      // display text (repo-relative path)
    status?: string;    // optional status letter (M/A/D/R/?) → trailing badge
    isFolder?: boolean;
}
interface FileGridProps {
    name?: string;
    items: FileGridItem[];
    /** Text for the path column's header (the section label, e.g. "Unstaged").
     *  The icon + status column headers stay empty. */
    label?: string;
    onClick?: (item: FileGridItem) => void;            // single click (open diff)
    onDoubleClick?: (item: FileGridItem) => void;      // stage / unstage one file
    onSelectionChange?: (items: FileGridItem[]) => void; // derived from the focus range
    getTrailing?: (item: FileGridItem) => ReactNode;   // status badge renderer
    compact?: boolean;
}
```

**Columns** (`Column<FileGridItem>[]`), with `fitToWidth`. Sorting is **enabled** (no `disableSorting`) so a
header click sorts; each column carries a comparator:
1. **icon** — `name: ""` (empty header), `width: 24`, `isStatusColumn: true`, `cellRenderer` →
   `<FileIcon path={row.filePath}>` (or `<FolderIcon>` when `isFolder`). Sort by **file extension**:
   `rowCompare: (a, b) => extOf(a.filePath).localeCompare(extOf(b.filePath))` (`extOf` via `fpExtname`).
   `formatValue: () => ""`.
2. **path** — `key: "title"`, `name: label` (← the "Unstaged"/"Staged" section label),
   `width: "10%"` (percent; absorbs remaining width under `fitToWidth`), `resizible: true`,
   `dataType: "string"`, `cellFormater` → `<TruncatedText>{row.title}</TruncatedText>`.
3. **status** — `key: "status"`, `name: ""`, `width: 40`, `isStatusColumn: true`, `dataType: "string"`
   (sorts by the M/A/D/R/? letter), `cellRenderer` → `getTrailing(row)` (the `<GitStatusBadge>`).
   `formatValue: (_c, r) => r.status ?? ""` (so the sort key is the status letter).

**Selection + clicks** (model-view-light — a few hooks, fine without a full model):
- Hold `const [focus, setFocus] = useState<CellFocus<FileGridItem>>()`; pass `focus`/`setFocus` to AVGrid →
  enables range select, shift-click, drag, Ctrl+A.
- An effect on `focus` derives the selected items from the row range (`min(rowStart,rowEnd) … max`) and
  calls `onSelectionChange`. **With sorting on, the focus indices refer to the displayed (sorted) order** —
  derive from AVGrid's sorted rows (`gridRef.models.focus.getGridSelection().rows`), NOT the raw `items`
  prop, or the wrong files get staged. (Keep an `AVGridModel` ref like `GitTree` does.)
- `onClick={(r) => onClick?.(r)}`, `onDoubleClick={(r) => onDoubleClick?.(r)}`.
- `getRowKey={(r) => r.filePath}`, `disableFiltering`, `rowHeight` (compact ≈ 22). **Sorting stays on.**

**Presentation — Concern #2 RESOLVED (2026-06-10).** Keep AVGrid's default header row + cell chrome — no
AVGrid changes. The **header row becomes the section label**: the path column's `name` is "Unstaged" /
"Staged"; the icon + status headers are empty. The separate label row in the panel header is removed (see
Phase 4). Header clicks also drive sorting (extension / path / status).

### Phase 4 — Panel: toolbar + selection + wiring

`GitChangesSecondaryView.tsx`:
- The section label now lives in the grid's header (path column `name`), so **drop the plain label
  `<Panel>`** from each list. The Staged list still needs a **toolbar row** for the buttons:
  `<Panel direction="row" align="center" paddingX="xs">` → `<Spacer/>` + two `IconButton`s
  (`ChevronUpIcon` / `ChevronDownIcon`), right-aligned. (Unstaged needs no toolbar row.)
- Swap each `<FileList>` for `<FileGrid>` with `label="Unstaged"` / `label="Staged"`. Map
  `GitFileChange[]` → `FileGridItem[]` (`{ filePath: c.path, title: c.path, status: c.status }`);
  `getTrailing` → `<GitStatusBadge>`; `onClick` → `openChangeDiff`.
- Track per-list selection in the panel from each grid's `onSelectionChange`
  (`selectedUnstaged: GitFileChange[]`, `selectedStaged: GitFileChange[]`).
- **Arrow buttons (both on the Staged header):**
  - **↓ (down) = Stage:** acts on the **Unstaged** selection → `model.changes.stagePaths(paths)`. Disabled
    when the Unstaged selection is empty.
  - **↑ (up) = Unstage:** acts on the **Staged** selection → `model.changes.unstagePaths(paths)`. Disabled
    when the Staged selection is empty.
  - Geometry: Unstaged is top, Staged is bottom — "down" moves files down into Staged, "up" moves them up
    into Unstaged. **Confirm — Concern #4.**
- **Double-click:** Unstaged grid → stage that file; Staged grid → unstage that file.
- Expand renames to `[path, oldPath]` before staging/unstaging. Clear the relevant selection after a move.

## Concerns / Open questions

1. **Multiselect approach — RESOLVED (2026-06-10):** `AVGrid` via a new `FileGrid`; **range** selection
   (not individual rows); double-click handles one-off non-contiguous files.
2. **`FileGrid` presentation — RESOLVED (2026-06-10):** keep AVGrid's default header + chrome (no AVGrid
   changes). The header row IS the section label (path column header = "Unstaged"/"Staged"; icon + status
   headers empty); the separate panel label row is removed. **Sorting is enabled** — header clicks sort by
   extension (icon col), path, or status letter.
3. **No-HEAD repo unstage — RESOLVED (2026-06-10):** add a `git rm --cached -- <paths>` fallback when
   `git reset` fails for lack of HEAD (initial-commit repos), so unstaging works before the first commit.
4. **Arrow direction — RESOLVED (2026-06-10):** ↓ = stage (operates on the *Unstaged* selection), ↑ =
   unstage (operates on the *Staged* selection). Both buttons on the Staged header.
5. **Partially-staged files — RESOLVED (2026-06-10):** a file staged-then-edited appears in **both** lists.
   Double-click its Unstaged row → `git add` → **fully staged**; double-click its Staged row → `git reset` →
   **fully unstaged** (matches Git Extensions). Free from the path-level ops — see Phase 2. Per-file, not
   per-hunk (hunk-level staging out of scope).
6. **Failure surfacing — RESOLVED (2026-06-10):** on `ok:false`, `app.ui.notify(…, "error")` toast + the
   lists stay put (`reload()` shows the unchanged truth). See Phase 2.
7. **Selection persistence — RESOLVED (2026-06-10):** transient view state, not persisted.

## Files Changed (planned)

| File | Change |
|------|--------|
| `src/main/git-service.ts` | New `stage` / `unstage`. |
| `src/ipc/git-ipc.ts` | `GitMutationResult` DTO. |
| `src/ipc/api-types.ts` | `gitStage` / `gitUnstage` endpoint + `Api` signatures. |
| `src/ipc/main/controller.ts` | `gitStage` / `gitUnstage` handlers + `bindEndpoint`. |
| `src/ipc/renderer/api.ts` | `gitStage` / `gitUnstage` executors. |
| `src/renderer/api/git.ts` | Gated `stage` / `unstage` wrappers. |
| `src/renderer/components/git-tree/GitChangesModel.ts` | `stagePaths` / `unstagePaths` (mutate + reload). |
| `src/renderer/components/file-grid/FileGrid.tsx` + `index.ts` | **New** — AVGrid-based file list (icon / path / status columns, header-as-label, sorting, range select, single+double click, context-menu passthrough). |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | Per-list toolbar, `FileGrid` swap, selection tracking, arrow buttons, double-click + context-menu wiring. |
| `src/renderer/uikit/AVGrid/model/AVGridModel.ts` + `ContextMenuModel.tsx` | Additive `getContextMenuItems?(selectedRows)` prop — caller items prepended above the built-in Copy group. |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | `openChangeDiff` dedup (in-flight guard + current-main-path check) to kill the double-click navigation "blink". |

## As-built notes (final — supersedes plan details above)

The plan above is the original design; these are the deltas that landed during implementation + testing:

- **`FileGrid` columns use `cellFormater` (not `cellRenderer`) and are NOT `isStatusColumn`.** `cellFormater`
  renders inside AVGrid's `DataCell`, which keeps all the mouse wiring (focus/range select, click,
  double-click, drag) intact for free. `isStatusColumn` was dropped (it forces sticky-left + can't sort).
- **Row height 20px + `fontSize.sm`** (matches the legacy `FileList` compact look). Columns are **not
  user-resizable** (no `resizible`).
- **Status column width 24px** (was 40px) — just fits the single-letter badge.
- **Arrow icons** are `FilterArrowUpIcon` / `FilterArrowDownIcon` (real arrows; the `Arrow*`/`Chevron*`
  glyphs are carets that read as expand/collapse).
- **Context-menu actions (added during testing).** Right-click a data row (range-aware):
  - Unstaged grid → **"Stage N files"** + **"Reset N files"** (separated, destructive).
  - Staged grid → **"Unstage N files"**.
  - Implemented via a new additive AVGrid prop `getContextMenuItems(selectedRows)` (prepended above Copy);
    `FileGrid` passes it through; the panel builds the git items.
- **"Reset" (added during testing).** Discards working-tree changes for the selected Unstaged files —
  backend `discard(dir, trackedPaths, untrackedPaths)`: tracked → `git checkout -- <paths>`; untracked
  (`?`) → `git clean -f -- <paths>` (deletes them). New `gitDiscard` IPC + gated `git.discard` wrapper +
  `GitChangesModel.resetChanges`. Confirmed first via `showConfirmationDialog` (the modal popup — NOT the
  script-facing `app.ui.confirm`); the message warns when untracked files will be deleted.
- **Double-click "blink" fix.** Two single clicks precede a double-click, so `openChangeDiff` ran twice and
  the diff re-mounted. Fixed with an in-flight path guard (`diffNavInFlight`, cleared on settle) + a
  current-main-editor path check (`mainEditorInstance.getNavigatorTarget().filePath`).
- **Failure toast** uses `ui.notify` (the global alerts-bar toast) in `GitChangesModel` — correct for the
  non-script, internal path.

## Acceptance criteria

- [x] The "Staged" list header is a toolbar: stage/unstage arrow buttons right-aligned (section label now
      in the grid header).
- [x] `FileGrid` renders icon / path / status columns; the path column header shows the section label
      ("Unstaged"/"Staged"), icon + status headers are empty, and `fitToWidth` keeps the path column
      filling the width.
- [x] Clicking a column header sorts the list — by file extension (icon col), path, or status letter.
- [x] Range-selecting file(s) in Unstaged + the stage arrow runs `git add` and moves them to Staged.
- [x] Range-selecting file(s) in Staged + the unstage arrow runs `git reset` and moves them to Unstaged.
- [x] Double-clicking a file moves it to the other list (stage from Unstaged, unstage from Staged).
- [x] Single-click still opens the file's Git Diff (no double-navigation "blink" on double-click).
- [x] Renames stage/unstage correctly (old + new path).
- [x] A partially-staged file: double-clicking its Unstaged row fully stages it; double-clicking its Staged
      row fully unstages it.
- [x] Arrow buttons disable when their source list has no selection.
- [x] Right-click → context-menu Stage / Unstage (range-aware); Unstaged also offers Reset.
- [x] "Reset N files" discards tracked changes (`git checkout`) and deletes untracked files (`git clean`),
      after a `showConfirmationDialog` confirmation.
- [x] Gated behind "Git integration"; mutations never throw — a failure shows an error toast and leaves the
      lists unchanged.
