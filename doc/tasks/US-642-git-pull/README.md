# US-642: Git Pull

**Epic:** EPIC-031  
**Depends on:** US-641 (Git Push) — reuses fetch/auth-env/ahead-behind/progress foundation

---

## Goal

Pull (fetch + integrate) the current branch from its upstream, surfaced through a new
**Git Extensions-style split-button** in the Git Tree editor toolbar: a primary action
(**Pull — merge**) with a caret dropdown offering **Pull (merge)** and **Fetch all**. This
folds the standalone Fetch button (shipped in US-641) into the split-button's dropdown, and
introduces a reusable `SplitButton` UIKit primitive. Reuses the fetch/auth-env/ahead-behind
foundation delivered by US-641.

---

## Background

### Foundation from US-641 (already merged)

US-641 delivers:
- `git.fetch()` / `git.aheadBehind()` / `git.push()` in `src/renderer/api/git.ts`
- `GitAheadBehind` DTO in `src/ipc/git-ipc.ts`
- `GitBranchesModel.fetch()` + `push()` + `reloadAheadBehind()` + `aheadBehind` in state
- `GitTreeEditorModel.fetch()` + `push()` convenience methods; `refresh()` calls
  `branches.reloadAheadBehind()` when the tree is visible
- The Git Tree editor toolbar **left cluster** (`GitTreeEditorView.tsx` `children`, NOT
  `rightContributions`): `Repo:` label → repo-name `Tag` badge → ahead/behind `↑N ↓N` badge
  → **Fetch** `IconButton` → (placeholder comment for Pull) → **Push** `IconButton` →
  vertical `Divider`. Only **Refresh** lives in `rightContributions` (far right).
- The two-arg `.env(name, value)` convention for `GIT_TERMINAL_PROMPT=0` in `git-service.ts`

The `↓N` behind-count badge in the toolbar is the pull affordance's visual trigger — the
user sees `↓N` and knows there is something to pull.

### Toolbar reshape this task performs

The current toolbar (US-641) is:

```
Repo: [badge] [↑N ↓N]  [⤓ Fetch]  [⤒ Push]  | … [⟳ Refresh]
```

US-642 replaces the standalone **Fetch** button with a **Pull split-button**:

```
Repo: [badge] [↑N ↓N]  [⤓ Pull ▾]  [⤒ Push]  | … [⟳ Refresh]
                         └ click          → Pull (merge)
                         └ caret ▾ menu   → ┌──────────────┐
                                            │ Pull (merge) │  (same as primary click)
                                            │ Fetch all    │  (→ existing model.fetch())
                                            └──────────────┘
```

- Primary click = **Pull (merge)** → `model.pull()`.
- Dropdown **Pull (merge)** = same as primary → `model.pull()`.
- Dropdown **Fetch all** = the existing `model.fetch()` (US-641 `git fetch --all --prune`).
- The standalone Fetch `IconButton` is **removed** — Fetch becomes a two-click action in the
  dropdown; Pull becomes the one-click primary (the Git Extensions trade-off).

### Pattern: env injection (confirmed in git-service.ts)

Same as US-641: use the two-argument `.env("GIT_TERMINAL_PROMPT", "0")` form. For pull, also
chain `.env("GIT_OPTIONAL_LOCKS", "0")` to avoid a stat-cache rewrite while the working tree
is being updated.

```typescript
simpleGit(dir)
    .env("GIT_OPTIONAL_LOCKS", "0")
    .env("GIT_TERMINAL_PROMPT", "0")
```

### Pattern: never-throw service function

Follow `commit()` / `push()` in `git-service.ts`: catch all errors, return
`{ ok: false, error: String(e) }`.

### simple-git pull API

`simpleGit(dir).pull(remote?, branch?, options?)` performs a git pull. For `--rebase` and
`--ff-only`, use `git.raw(["pull", ...flags])` directly (simplest, same as other functions in
the file). For conflict detection the error message is more reliable than the result object.

Conflict detection: when `git pull` encounters conflicts, git exits non-zero and the error
message contains "Automatic merge failed; fix conflicts and then commit the result" or
"CONFLICT". Parse the stderr/message from `String(e)`.

### Pattern: GitBranchesModel methods

`GitBranchesModel.ts`: mutation methods (`fetch`, `push`) set a busy-state flag in a
`try/finally`, call the git API, toast on failure, call `reload()`, then clear the flag.
`pull()` follows the same structure.

### Pattern: GitChangesModel mutation method

`GitChangesModel.ts`: mutation methods toast on failure and call `this.reload()`. Pull must
refresh the changes model AND the branches model because the working tree changes AND the
branch advances past the old position. Cross-model coordination lives in
`GitTreeEditorModel.pull()` (Step 8), not in the view.

### GitTreeEditorModel public fields

`GitTreeEditorModel.ts`: both `changes` and `branches` are public readonly fields. The owning
editor has `refreshChanges()` / `refreshBranches()` private methods and a visibility-aware
`refresh()`. `refresh()` already reloads the Changes panel when it is visible (and marks it
stale when hidden), so `pull()` relies on `this.refresh()` rather than calling
`changes.reload()` directly.

### UI surface: `SplitButton` UIKit primitive (NEW)

No split-button primitive exists in `src/renderer/uikit/`. This task adds one. It composes
existing primitives — `IconButton` for the primary + caret regions, and `WithMenu`
(`src/renderer/uikit/Menu/WithMenu.tsx`) for the dropdown (render-prop `children(setOpen)` +
`Menu` over `MenuItem[]`). `MenuItem` (`uikit/Menu/types.ts`) already supports
`label`/`icon`/`onClick`/`disabled`/`startGroup`. Follow all UIKit rules
(`src/renderer/uikit/CLAUDE.md`): `data-type="split-button"`, `name` → `data-name`, tokens
for spacing/size, `color.ts` for colors, no hardcoded values.

### UI surface: Git Tree editor toolbar (primary home)

`GitTreeEditorView.tsx` left cluster (`children`). The placeholder comment
`{/* US-642 inserts the Pull button here, between Fetch and Push */}` marks the spot. This
task removes the standalone Fetch `IconButton` and inserts the Pull `SplitButton` in its
place, between the ahead/behind badge and the Push button.

### Icons (symmetric, no clash)

With the standalone Fetch button gone, the `DownloadIcon` glyph is free. Use:
- **Pull primary** → `DownloadIcon` (tray-down — "bring remote changes down into the working
  tree"); symmetric with **Push** → `UploadIcon` (tray-up). Both already exist in
  `theme/icons.tsx`.
- **Caret** → `ArrowDownIcon` (the bare chevron at `theme/icons.tsx`). As a dropdown caret
  this chevron is semantically correct — it *is* an expand affordance (the exact reading that
  made it wrong as an action icon for Push).

### CommitDialog — no changes needed for pull

Pull does not use the Commit dialog.

### Conflict UX — report-only in v1

When pull produces conflicts, the conflicted files appear in the Unstaged list with status
`U` (unmerged). `GitChangesModel.reload()` already captures them. No special rendering is
needed in v1 — `GitStatusBadge` renders unknown status codes — but a clear toast listing the
conflicted files is required so the user knows what happened.

---

## Implementation Plan

### Step 1 — DTOs in `src/ipc/git-ipc.ts`

Add after the `GitPushResult` block (US-641):

```typescript
/** Options for `git pull` (US-642). */
export interface GitPullOptions {
    /** When true, pull with `--rebase` instead of merge. */
    rebase?: boolean;
    /** When true, pull with `--ff-only` (fails if a non-fast-forward merge is needed). */
    ffOnly?: boolean;
}

/** Result of a `git pull` operation (US-642). */
export interface GitPullResult {
    ok: boolean;
    error?: string;
    /** True when the pull failed because it left merge conflicts in the working tree. */
    hadConflicts?: boolean;
    /** Repo-relative paths of conflicted files (when `hadConflicts` is true). */
    conflicts?: string[];
    /** Human-readable summary from git (e.g. "Already up to date."). */
    summary?: string;
}
```

### Step 2 — Service function in `src/main/git-service.ts`

Update the import to include `GitPullOptions` and `GitPullResult`. Add after `push()`:

```typescript
/**
 * Pull from the current branch's upstream (US-642). Merge by default; `--rebase` when
 * `opts.rebase`, `--ff-only` when `opts.ffOnly`. Sets GIT_TERMINAL_PROMPT=0 so HTTPS
 * without a credential helper fails fast; GIT_OPTIONAL_LOCKS=0 to avoid a stat-cache
 * rewrite. Detects conflicts from the error text and populates `conflicts[]`. Never throws.
 */
export async function pull(dir: string, opts: GitPullOptions = {}): Promise<GitPullResult> {
    try {
        const git = simpleGit(dir)
            .env("GIT_OPTIONAL_LOCKS", "0")
            .env("GIT_TERMINAL_PROMPT", "0");

        const args = ["pull"];
        if (opts.rebase) args.push("--rebase");
        if (opts.ffOnly) args.push("--ff-only");

        const out = await git.raw(args);
        return { ok: true, summary: out.trim() || undefined };
    } catch (e) {
        const msg = String(e);
        const hadConflicts = /CONFLICT|Automatic merge failed/i.test(msg);
        const conflicts: string[] = [];
        if (hadConflicts) {
            for (const m of msg.matchAll(/CONFLICT[^\n]*?: Merge conflict in (.+)/g)) {
                conflicts.push(m[1].trim());
            }
        }
        return { ok: false, error: msg, hadConflicts, conflicts: conflicts.length ? conflicts : undefined };
    }
}
```

### Step 3 — Endpoint enum and Api interface in `src/ipc/api-types.ts`

Add to the `Endpoint` enum after `gitPush`:

```typescript
    gitPull = "gitPull",
```

Update the import to include `GitPullOptions` and `GitPullResult`. Add to the `Api`
interface after the `gitPush` entry:

```typescript
    [Endpoint.gitPull]: (dir: string, opts?: GitPullOptions) => Promise<GitPullResult>;
```

### Step 4 — Controller handler in `src/ipc/main/controller.ts`

Update the import to include `GitPullOptions`. Add a handler after `gitPush`:

```typescript
    gitPull = async (_event: IpcMainEvent, dir: string, opts?: GitPullOptions) => {
        const { pull } = await import("../../main/git-service");
        return pull(dir, opts);
    };
```

Add the `bindEndpoint` registration in `init()` after `gitPush`:

```typescript
    bindEndpoint(Endpoint.gitPull, controllerInstance.gitPull);
```

### Step 5 — ApiCalls in `src/ipc/renderer/api.ts`

Update the import to include `GitPullOptions` and `GitPullResult`. Add after `gitPush`:

```typescript
    gitPull = async (dir: string, opts?: GitPullOptions) => {
        return executeOnce<GitPullResult>(Endpoint.gitPull, dir, opts);
    };
```

### Step 6 — Renderer git wrapper in `src/renderer/api/git.ts`

Update the import to include `GitPullOptions` and `GitPullResult`. Add a safe fallback
constant near the others:

```typescript
const PULL_FAIL: GitPullResult = { ok: false, error: "git disabled" };
```

Add a `pull` method to the `git` object after `push`:

```typescript
    /**
     * Pull from the current branch's upstream (US-642). Returns `{ ok:false }` (no-op)
     * when git is off or no root given. On conflict, `hadConflicts` is true and
     * `conflicts[]` lists the affected paths. Never throws.
     */
    pull(repoRoot: string, opts?: GitPullOptions): Promise<GitPullResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(PULL_FAIL);
        return api.gitPull(repoRoot, opts).catch((e): GitPullResult => ({ ok: false, error: String(e) }));
    },
```

### Step 7 — GitBranchesModel: `pull()` method and `pulling` state

**File:** `src/renderer/components/git-tree/GitBranchesModel.ts`

**7a.** Update the type import (US-641 added `GitAheadBehind`):

```typescript
import type { GitRefs, GitAheadBehind, GitPullOptions } from "../../../ipc/git-ipc";
```

**7b.** Extend `GitBranchesState` after `fetching`:

```typescript
    /** A pull is in flight (drives the Pull button busy state). */
    pulling: boolean;
```

**7c.** Add `pulling: false` to `defaultGitBranchesState`.

**7d.** Add `pull()` after `push()`, mirroring `fetch()`/`push()` (busy flag in `try/finally`):

```typescript
/** Pull from the current branch's upstream (US-642). Merge by default; rebase when
 *  `opts.rebase`. On success reloads refs + ahead/behind; on conflict toasts the list of
 *  conflicted files (the Changes panel then shows them with status 'U'); on other failure
 *  (no upstream, HTTPS auth, dirty tree) toasts the git error. Never throws. The `finally`
 *  guarantees the busy flag clears even if `reload()` throws. */
pull = async (opts?: GitPullOptions): Promise<void> => {
    if (!this.repoRoot) return;
    this.write((s) => { s.pulling = true; });
    try {
        const r = await git.pull(this.repoRoot, opts);
        if (!r.ok) {
            if (r.hadConflicts && r.conflicts?.length) {
                const list = r.conflicts.slice(0, 5).join(", ") + (r.conflicts.length > 5 ? ", …" : "");
                void ui.notify(`Pull stopped with conflicts: ${list}`, "error");
            } else {
                void ui.notify(`Failed to pull: ${r.error ?? "unknown error"}`, "error");
            }
        } else if (r.summary) {
            void ui.notify(r.summary, "success");
        }
        await this.reload();
    } finally {
        this.write((s) => { s.pulling = false; });
    }
};
```

### Step 8 — GitTreeEditorModel: `pull()` convenience method

**File:** `src/renderer/editors/git-tree/GitTreeEditorModel.ts`

Add `pull()` alongside `fetch()`/`push()` (US-641), mirroring the same delegate-then-refresh
shape. `refresh()` already reloads the Changes panel when visible (and marks it stale when
hidden), so there is no separate `changes.reload()` call:

```typescript
/** Pull from the current branch's upstream, then reload the commit graph + ahead/behind +
 *  Changes panel (US-642). Delegates the git op + toast to `branches.pull()`, then
 *  `this.refresh()` (visibility-aware: reloads the graph + ahead/behind, and the Changes
 *  panel when it's open). The view calls `model.pull()` — not `branches.pull()` — keeping
 *  cross-model coordination in the editor model. Never throws. */
pull = async (opts?: GitPullOptions): Promise<void> => {
    await this.branches.pull(opts);
    this.refresh();
};
```

Import `GitPullOptions` from `"../../../ipc/git-ipc"` at the top of the file.

### Step 9 — New UIKit `SplitButton` primitive

**Folder:** `src/renderer/uikit/SplitButton/` (`SplitButton.tsx`, `index.ts`,
`SplitButton.story.tsx`). Export from `src/renderer/uikit/index.ts`.

A primary clickable region (icon + `onClick`) joined to a narrow caret region that opens a
dropdown `Menu` via `WithMenu`. Follow `uikit/CLAUDE.md`: `data-type="split-button"`,
`name` → `data-name`, tokens, `color.ts`, no hardcoded values.

**API:**

```typescript
export interface SplitButtonProps {
    /** Debug label → data-name. */
    name?: string;
    /** Primary-region icon. */
    icon: React.ReactNode;
    /** Primary-region tooltip. */
    title?: string;
    /** Primary-region click (the default action). */
    onClick: () => void;
    /** Dropdown items (caret region). */
    items: MenuItem[];
    /** Disables the primary region (caret stays usable unless `menuDisabled`). */
    disabled?: boolean;
    /** Disables the caret/dropdown. */
    menuDisabled?: boolean;
    /** Size variant — matches IconButton ("sm" | "md" only). Default "md". */
    size?: "sm" | "md";
    /** Caret tooltip. Default "More actions". */
    menuTitle?: string;
}
```

**Implementation sketch** (compose `IconButton` + `WithMenu`; a hairline divider separates
the two regions):

```tsx
import React from "react";
import styled from "@emotion/styled";
import { IconButton } from "../IconButton/IconButton";
import { WithMenu } from "../Menu/WithMenu";
import { ArrowDownIcon } from "../../theme/icons";
import type { MenuItem } from "../Menu/types";
import color from "../../theme/color";
import { radius } from "../tokens";

const Root = styled.div({
    display: "inline-flex",
    alignItems: "center",
    borderRadius: radius.sm,
    "& > [data-name='split-caret']": { borderLeft: `1px solid ${color.border.default}` },
}, { label: "SplitButton" });

export function SplitButton({
    name, icon, title, onClick, items, disabled, menuDisabled, size = "md", menuTitle = "More actions",
}: SplitButtonProps) {
    return (
        <Root data-type="split-button" data-name={name}>
            <IconButton name="split-primary" size={size} title={title} icon={icon}
                disabled={disabled} onClick={onClick} />
            <WithMenu name={name ? `${name}-menu` : undefined} items={items} placement="bottom-end">
                {(setOpen) => (
                    <IconButton name="split-caret" size={size} title={menuTitle}
                        icon={<ArrowDownIcon />} disabled={menuDisabled}
                        onClick={(e) => setOpen(e.currentTarget)} />
                )}
            </WithMenu>
        </Root>
    );
}
```

> Confirm `IconButton`'s `onClick` forwards the event (needed for `e.currentTarget`); if it
> only exposes `() => void`, capture the anchor via a `ref` on the caret `IconButton`
> instead and call `setOpen(ref.current)`. Confirm `color.border.default` exists (it is used
> across UIKit); pick the nearest existing border token if the name differs. `radius`/`size`
> tokens per `uikit/tokens.ts`.

### Step 10 — Wire the Pull `SplitButton` into the toolbar

**File:** `src/renderer/editors/git-tree/GitTreeEditorView.tsx`

**10a.** Extend the existing `model.branches.state.use(...)` hook (US-641) to read `pulling`:

```typescript
const { aheadBehind, pushing, fetching, pulling } = model.branches.state.use((s) => ({
    aheadBehind: s.aheadBehind,
    pushing: s.pushing,
    fetching: s.fetching,
    pulling: s.pulling,
}));
```

**10b.** Imports: add `SplitButton` (from `../../uikit/SplitButton` or the `uikit` barrel);
`DownloadIcon` is already imported (US-641); `ArrowDownIcon` is internal to `SplitButton`
(not needed here). `MenuItem` type from `../../uikit/Menu` if building the items array inline.

**10c.** **Remove** the standalone Fetch `IconButton` (the `name="git-tree-fetch"` block) and
the `{/* US-642 inserts the Pull button here… */}` comment. In its place insert the Pull
split-button (between the ahead/behind badge and the Push button):

```tsx
<SplitButton
    name="git-tree-pull"
    size="sm"
    icon={<DownloadIcon />}
    title={
        !aheadBehind.hasUpstream ? "Pull (no upstream configured)"
            : aheadBehind.behind > 0 ? `Pull ${aheadBehind.behind} commit(s) — merge`
                : "Pull — merge (up to date)"
    }
    disabled={pulling || fetching || !aheadBehind.hasUpstream}
    menuDisabled={pulling || fetching}
    items={[
        {
            label: "Pull (merge)",
            icon: <DownloadIcon />,
            disabled: !aheadBehind.hasUpstream,
            onClick: () => void model.pull(),
        },
        {
            label: "Fetch all",
            startGroup: true,
            onClick: () => void model.fetch(),
        },
    ]}
    onClick={() => void model.pull()}
/>
```

Notes:
- Primary click and the "Pull (merge)" item both call `model.pull()` (merge — no opts).
- "Fetch all" calls the existing `model.fetch()` (US-641 `git fetch --all --prune`); it stays
  available even with no upstream, so it is NOT gated on `hasUpstream`.
- The busy state (`pulling || fetching`) disables both regions so the user can't overlap a
  fetch and a pull.
- The Push `IconButton` and Refresh `rightContributions` button are unchanged.

---

## Concerns / Open Questions

All settled as deferred unless noted; no decision needed before implementation starts.

1. **Merge vs rebase default.** `pull()` defaults to merge. A `git.pull.rebase` setting or a
   third "Pull (rebase)" dropdown item is deferred. `GitPullOptions.rebase` is plumbed all the
   way to the service, so adding a "Pull (rebase)" item later is a one-line UI change
   (`onClick: () => void model.pull({ rebase: true })`).

2. **Conflict UX — report-only in v1.** Conflicted files appear in the Unstaged list as `U`.
   No in-app merge tool; the user resolves via an external editor or the File Diff view.
   Auto-abort on conflict is explicitly not done.

3. **Dirty working tree.** `git pull` may fail with "Your local changes … would be
   overwritten by merge". Surfaced as a `{ ok:false, error }` toast. `--autostash` is deferred.

4. **No upstream case.** When the current branch has no upstream, the primary Pull region is
   disabled (`!aheadBehind.hasUpstream`). "Fetch all" stays enabled. No hang, no confusing
   error — the primary is simply grayed.

5. **Conflict regex fragility.** `CONFLICT[^\n]*?: Merge conflict in (.+)` parses git's
   English output. If git's locale is not English the regex may not match — `hadConflicts`
   stays true but `conflicts[]` is empty and the toast falls back to the raw error. Acceptable
   for v1.

6. **Summary toast on "Already up to date."** `pull()` returns `summary: "Already up to
   date."` on a no-op; the model toasts it as `success` so the user gets feedback that pull
   ran and the branch is current.

7. **Progress (streaming) — deferred.** Same as US-641: v1 uses busy state + toast.

8. **`--ff-only` as a UI option.** `GitPullOptions.ffOnly` is plumbed to the service but not
   exposed in the UI in v1. A future "Pull (fast-forward only)" dropdown item can call
   `model.pull({ ffOnly: true })`.

9. **Secondary Pull affordances in the Branches panel** (header button, branch-node context
   item) are deferred — the toolbar split-button is the primary and only required home in v1.

10. **`SplitButton` event forwarding.** The primitive needs the caret anchor element to
    position the menu. If `IconButton.onClick` does not forward the DOM event, capture the
    anchor with a `ref` instead (noted in Step 9). Confirm during implementation.

---

## Acceptance Criteria

- [ ] The toolbar shows a Pull **split-button** (primary + caret) where the standalone Fetch
      button used to be; the standalone Fetch button is gone.
- [ ] Primary click pulls (merge), integrates remote commits into the current branch, updates
      the working tree, and the ahead/behind badge clears the `↓N` count.
- [ ] The caret dropdown shows **Pull (merge)** and **Fetch all**; "Pull (merge)" matches the
      primary, "Fetch all" runs `git fetch --all --prune` and refreshes refs/ahead-behind.
- [ ] Rebase pull (`opts.rebase=true`, if exercised via a future item or test) works and the
      graph reflects rebased history after reload.
- [ ] When pull produces conflicts, the Changes panel's Unstaged list shows conflicted files
      with status `U`, and a toast lists (up to 5) conflicted file names.
- [ ] Pulling a branch with no upstream grays the primary Pull region (never hangs); "Fetch
      all" stays available.
- [ ] HTTPS pull without credentials fails fast (no hang) with a readable error toast.
- [ ] Dirty working tree that would be overwritten surfaces a clear error toast; no silent
      failure.
- [ ] "Already up to date" pull shows a success toast.
- [ ] When `git.enabled` is off, `pull` returns immediately with no git spawn.
- [ ] After a successful pull, the Changes panel and Branches panel reflect the new state
      without a manual refresh.
- [ ] `SplitButton` follows UIKit rules (`data-type`, `name`→`data-name`, tokens, `color.ts`,
      no hardcoded values) and has a story.

---

## Files Changed

| File | Change |
|---|---|
| `src/ipc/git-ipc.ts` | Add `GitPullOptions`, `GitPullResult` DTOs |
| `src/main/git-service.ts` | Add `pull()` function |
| `src/ipc/api-types.ts` | Add `Endpoint.gitPull`; add `Api` signature |
| `src/ipc/main/controller.ts` | Add `gitPull` handler method + `bindEndpoint` call |
| `src/ipc/renderer/api.ts` | Add `gitPull` to `ApiCalls` |
| `src/renderer/api/git.ts` | Add `pull` wrapper + `PULL_FAIL` |
| `src/renderer/components/git-tree/GitBranchesModel.ts` | Extend state with `pulling`; add `pull()`; update import |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | Add `pull()` convenience method (delegates to `branches.pull()`, then `refresh()`) |
| `src/renderer/uikit/SplitButton/SplitButton.tsx` | **NEW** — split-button primitive (IconButton + WithMenu) |
| `src/renderer/uikit/SplitButton/index.ts` | **NEW** — export |
| `src/renderer/uikit/SplitButton/SplitButton.story.tsx` | **NEW** — story |
| `src/renderer/uikit/index.ts` | Export `SplitButton` |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | Remove standalone Fetch button; add Pull `SplitButton` (Pull merge primary + dropdown Pull/Fetch all); read `pulling` |

## Files That Need No Changes

- `src/renderer/ui/dialogs/CommitDialog.tsx` — not involved in pull.
- `src/renderer/components/git-tree/GitChangesModel.ts` — `reload()` is driven by
  `GitTreeEditorModel.refresh()`; no new methods.
- `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` — no pull affordance here.
- `src/renderer/editors/git-tree/GitBranchesSecondaryView.tsx` — unchanged in v1.
- `src/renderer/components/git-tree/git-refs-tree.ts` — pure presentation, unchanged.
- `src/renderer/theme/icons.tsx` — reuses existing `DownloadIcon` / `ArrowDownIcon`; no new icon.
- `src/shared/types.ts`, `src/shared/link-data.ts` — unaffected.
- `src/renderer/api/ui.ts` — already imported in `GitBranchesModel` (US-641).
