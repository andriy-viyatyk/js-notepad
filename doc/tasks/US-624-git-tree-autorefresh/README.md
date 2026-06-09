# US-624: Git Tree auto-refresh (working-tree watcher)

**Epic:** [EPIC-031](../../epics/EPIC-031.md) · **Status:** ✅ Completed (2026-06-10) — user-tested; `/review` (clean — 0 must-fix, 2 suggestions consciously declined) + `/document` + `/userdoc` done; marked `[x]`. Stays listed under EPIC-031.

## Resolved decisions (2026-06-09)

1. **No settings toggle** — auto-refresh is **always on** whenever `git.enabled` is on.
2. **Debounce 500ms** (Explorer's value).
3. **Full `refresh()`** on any change for v1 (may split graph/status later if needed).
4. **Accept large-repo noise** — no path filtering; user can close the Git Tree view if a huge repo makes it slow.

## Goal

Auto-refresh the Git Tree editor (commit graph + "Changes" panel) when the repository changes on disk — so committing, staging/unstaging, checking out, or editing a tracked file updates the view without a manual Refresh click.

## Decision (agreed in discussion)

- **Option A — watch the working-tree root recursively** (mirrors the Explorer's `FileTreeProvider.watch`). A single recursive `fs.watch` on `repoRoot` covers *everything*: working-tree edits (→ unstaged list) **and** `.git` ref/index changes (→ commit graph + staged list), because `.git` lives under the root.
- **`--no-optional-locks` for status** to break the feedback loop: `git status` can rewrite `.git/index` (stat-cache refresh), which the recursive watcher would see → refresh → status → rewrite → … `GIT_OPTIONAL_LOCKS=0` (≡ `git --no-optional-locks status`) tells git to skip the optional index-lock/rewrite during status. `git log` does not write, so the graph reload is loop-safe on its own.

## Background — what we build on

| Piece | File | Role |
|---|---|---|
| Recursive watch precedent | `src/renderer/content/tree-providers/FileTreeProvider.ts:202` | `nodefs.watch(root, { recursive: true }, debounce(cb, 500))`; try/catch graceful degrade; `unsubscribe()` closes. |
| `debounce` util | `src/shared/utils.ts` | Already used by `FileWatcher` (300ms) and Explorer (500ms). |
| `fs`-allowed location | `src/renderer/core/utils/file-watcher.ts` | Documented exception that may `require("fs")`. New watch util goes here (coding rule: only `file-path.ts`/`fs.ts` + documented exceptions touch `fs` directly). |
| Owner model | `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | Holds `repoRoot`, both submodels, and `refresh()`. Watcher lifecycle lives here. |
| Commit graph reload | `GitTreeModel.reload` → `git.log` | Read-only; loop-safe. |
| Status reload | `GitChangesModel.reload` → `git.status` | The call that needs `--no-optional-locks`. |
| Status backend | `src/main/git-service.ts:144` `status(dir)` = `simpleGit(dir).status()` | Add the env var here. |
| Refresh entry point | `GitTreeEditorModel.refresh()` | Reloads `gitTree` + `changes`; bound already. |

## Implementation plan

### 1. `--no-optional-locks` on status — `src/main/git-service.ts`
Change `status(dir)` to disable optional locks:
```ts
const s = await simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0").status();
```
- `GIT_OPTIONAL_LOCKS=0` is the documented equivalent of `--no-optional-locks` and avoids the index rewrite. **Verify** simple-git's `.env(name, value)` *supplements* the process env (vs the single-object form which *replaces* it) — use the two-arg form so `PATH` etc. survive. If the two-arg form replaces, fall back to `.env({ ...process.env, GIT_OPTIONAL_LOCKS: "0" })`.
- No `git-ipc`/`git.ts` change — this is unconditional and safe (status is reporting-only; we never want it taking the optional lock).

### 2. Reusable recursive-directory watcher — `src/renderer/core/utils/file-watcher.ts`
Add a small, self-contained watcher (sits next to `FileWatcher`, same `require("fs")` exemption):
```ts
export class DirectoryWatcher {
    constructor(dirPath: string, onChange: () => void, debounceMs = 500);
    dispose(): void;
}
```
- Wraps `nodefs.watch(dirPath, { recursive: true }, debounce(onChange, debounceMs))` in try/catch (graceful no-op on failure — network drives, missing dir, Linux non-recursive).
- Mirrors `FileTreeProvider.watch` but as a disposable class consistent with `FileWatcher`. (Explorer could adopt it later; not in scope.)

### 3. Watcher lifecycle in the owner — `src/renderer/editors/git-tree/GitTreeEditorModel.ts`
- Add `private repoWatcher?: DirectoryWatcher;` and `private watchedRoot?: string;`.
- New `private startWatching()`:
  - Return early unless `settings.get("git.enabled")` **and** (if we add the toggle) `settings.get("git.autoRefresh")` **and** `repoRoot` is set.
  - If `watchedRoot === repoRoot` → keep existing watcher (idempotent).
  - Otherwise dispose the old watcher and create `new DirectoryWatcher(repoRoot, () => this.refresh(), 500)`.
- Call `startWatching()` at the end of `syncGitTree()` (covers fresh open via `initFromRepoRoot` and session `restore()`).
- Dispose in `dispose()`: `this.repoWatcher?.dispose()`.
- Loop-safety: the debounced callback calls `refresh()` = `git log` (no write) + `git status` (now `--no-optional-locks`, no write) → no self-trigger.

## Concerns / Open questions (need your call)

1. **Settings toggle?** Add `git.autoRefresh` (default **on**, gated under `git.enabled`) so users on very large repos can turn it off — *or* keep it always-on when git is enabled (less surface)? **Lean:** add the toggle.
2. **Debounce interval** — 500ms (Explorer's value). **Lean:** 500ms.
3. **Refresh granularity** — v1 calls full `refresh()` (graph + status) on any change. A plain file save then re-runs `git log` needlessly. Optional later optimization: accumulate whether the debounce window touched `.git` vs the working tree (recursive-watch `filename` arg) and reload only the relevant submodel. **Lean:** full `refresh()` for v1; note the optimization.
4. **Large-repo noise** — recursive watch on the root sees `node_modules`/build churn. Events debounce to one cheap read; `git status` ignores git-ignored paths so the lists stay clean. Accepted tradeoff (same as Explorer). The toggle (#1) is the escape hatch.
5. **Multiple repos** — each open Git Tree editor watches its own `repoRoot`; independent watchers, disposed per editor. Fine.

## Acceptance criteria

- Editing+saving a tracked file (in Persephone or externally) updates the **unstaged** list within ~1 debounce interval.
- `git add`/`reset` on the CLI updates **staged**/**unstaged** lists.
- A new commit / checkout / merge / fetch on the CLI updates the **commit graph**.
- No refresh loop at idle (verify status no longer rewrites `.git/index`; watch stays quiet when nothing changes).
- Watcher is torn down on editor close (no leaked `fs.watch` handles); degrades gracefully when watch can't be established.
- All behavior stays behind `git.enabled` (+ `git.autoRefresh` if added).
