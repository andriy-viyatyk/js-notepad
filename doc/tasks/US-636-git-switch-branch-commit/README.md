# US-636: Git Tree — Switch to branch / remote branch / commit (EPIC-031)

**Status:** ✅ Complete — implemented, user-tested, and reviewed (`/review` + `/document` + `/userdoc` run
alongside US-634/US-635). Marked `[x]` on the dashboard. `tsc --noEmit` + `eslint` clean.
**Epic:** [EPIC-031 — Git Functionality Enhancements](../../epics/EPIC-031.md)
**Relation:** Builds on the refs infrastructure from [US-634](../US-634-git-branches-tags-panel/README.md) /
[US-635](../US-635-git-branches-panel-polish/README.md) (the "Branches & Tags" panel) and the commit-grid
context-menu hook pattern from [US-631](../US-631-git-stage-unstage/README.md) (the "Changes" panel).

## Goal

Add the first **history-mutating** git operation — checking out a branch, a remote branch, or a commit —
exposed through context menus on two surfaces: the **Git Tree commit grid** (right-click a commit) and the
**"Branches & Tags" panel** (right-click a branch / remote branch / tag). The UI uses the modern git verb
**"Switch"** consistently (matching `git switch`):

- **Switch to Branch** — `git switch <name>` (a local branch).
- **Switch to Remote Branch** — creates (or reuses) a local tracking branch, then switches to it.
- **Switch to Commit** — `git switch --detach <hash>` (detached HEAD).
- **Switch to Tag** *(included; flagged below)* — `git switch --detach <tag>` (detached HEAD).

## Background

### The git operation

Git 2.23+ split `git checkout` into `git switch` (branches) and `git restore` (files). `git switch` is the
intention-revealing command and matches the chosen UI vocabulary, so the service uses it:

| UI action | git command |
|-----------|-------------|
| Switch to Branch `main` | `git switch main` |
| Switch to Remote Branch `origin/feature/x` | `git switch -c feature/x --track origin/feature/x` (fallback `git switch feature/x` if the local branch already exists) |
| Switch to Commit `a1b2c3d` | `git switch --detach a1b2c3d` |
| Switch to Tag `v1.0.0` | `git switch --detach v1.0.0` |

`git switch` requires git ≥ 2.23 (released Aug 2019) — safe for this app's audience. Every op is best-effort
and **never throws**: a dirty working tree that would be clobbered makes git exit non-zero, and the service
returns `{ ok: false, error }` so the renderer can toast it (exactly like `stage`/`commit` in US-631/US-632).
The existing **US-624 working-tree watcher** fires after HEAD moves and refreshes the tree/panels; the model
also calls `refresh()` for immediate feedback.

### Existing plumbing this task extends (the established mutating-op pattern, US-631/US-632)

The git stack is a fixed 6-layer chain. `stage`/`unstage`/`discard`/`commit` already thread through every
layer and are the template to copy:

1. **`src/main/git-service.ts`** — `async function <op>(dir, …): Promise<GitMutationResult>` wrapping `simpleGit`.
2. **`src/ipc/git-ipc.ts`** — shared DTOs (`GitMutationResult` already exists; this task adds `GitSwitchTarget`).
3. **`src/ipc/api-types.ts`** — `Endpoint.<op>` enum member + `Api` signature.
4. **`src/ipc/main/controller.ts`** — `<op>` handler (lazy `import("../../main/git-service")`) + `bindEndpoint`.
5. **`src/ipc/renderer/api.ts`** — `<op> = async (…) => executeOnce<…>(Endpoint.<op>, …)`.
6. **`src/renderer/api/git.ts`** — `git.<op>(repoRoot, …)`: gated on `settings.get("git.enabled")` + `repoRoot`,
   `.catch(() => ({ ok:false, error }))`, never throws.

The renderer **model** layer then calls `git.<op>` and toasts on failure (see `GitChangesModel.commit`).

### Context-menu hooks (both already exist — no new infra)

- **Commit grid** — `AVGrid` already supports `getContextMenuItems?: (selectedRows: R[]) => MenuItem[]`
  (`AVGridModel.ts:62`, wired in `ContextMenuModel.tsx:43`). `GitTree` (`components/git-tree/GitTree.tsx`)
  does **not** yet forward it — this task adds the pass-through prop. The `FileGrid` in
  `GitChangesSecondaryView` is the reference for building `MenuItem[]` from the selection.
- **Branches panel** — `Tree` already supports `getContextMenu?: (item: T, level: number) => MenuItem[] | undefined`
  (`uikit/Tree/types.ts:177`, dispatched per-row via `model.onItemContextMenu`). `GitBranchesSecondaryView`'s
  `<Tree<GitRefNode>>` just needs the prop wired. This gets the **exact right-clicked node** (`GitRefNode`
  carries `kind` + `refName`), so there is no selection ambiguity.

### Key types

- `GitRef { name: string; kind: "head" | "branch" | "remote" | "tag" }` — decoration refs on a commit. The
  **checked-out** branch decorates as `kind: "head"` (US-635), so it is identifiable without comparing names.
- `GitCommitRow extends GitCommit` (`swimlane-layout.ts`) — has `hash`, `shortHash`, `refs: GitRef[]`,
  `recordType`. The grid's `getContextMenuItems` receives these rows.
- `GitRefNode { kind?: "branch" | "remote-branch" | "tag"; refName?: string; … }` (`git-refs-tree.ts`) —
  panel leaves. Roots/folders carry no `kind` → no menu.

## Implementation plan

### 1. Shared DTO — `src/ipc/git-ipc.ts`

Add after `GitIdentity` (reuses the existing `GitMutationResult`):

```ts
/** Target of a `git switch` (EPIC-031 / US-636). The renderer builds this from a
 *  clicked commit row or refs-panel node; the service maps it to a `git switch` form. */
export type GitSwitchTarget =
    | { type: "branch"; name: string }   // local branch → `git switch <name>`
    | { type: "remote"; ref: string }    // full remote ref "origin/feature/x" → tracking branch
    | { type: "commit"; hash: string }   // detached HEAD at a commit
    | { type: "tag"; name: string };     // detached HEAD at a tag
```

### 2. Main-process op — `src/main/git-service.ts`

Add `GitSwitchTarget` to the type import, then append:

```ts
/**
 * Switch HEAD to a branch / remote branch / commit / tag (EPIC-031 / US-636) — the
 * first history-moving op. Uses `git switch` (git ≥ 2.23):
 *   - branch  → `switch <name>`
 *   - remote  → `switch -c <short> --track <ref>`, falling back to `switch <short>`
 *               when the local branch already exists (so re-switching just works)
 *   - commit  → `switch --detach <hash>` (detached HEAD)
 *   - tag     → `switch --detach <tag>`  (detached HEAD)
 * Never throws — a dirty tree that would be overwritten makes git exit non-zero and
 * is returned as `{ ok:false, error }` for the renderer to toast.
 */
export async function switchTo(dir: string, target: GitSwitchTarget): Promise<GitMutationResult> {
    try {
        const git = simpleGit(dir);
        switch (target.type) {
            case "branch":
                await git.raw(["switch", target.name]);
                break;
            case "commit":
                await git.raw(["switch", "--detach", target.hash]);
                break;
            case "tag":
                await git.raw(["switch", "--detach", target.name]);
                break;
            case "remote": {
                // "origin/feature/x" → local "feature/x" (strip the first segment = remote name).
                const short = target.ref.slice(target.ref.indexOf("/") + 1);
                try {
                    await git.raw(["switch", "-c", short, "--track", target.ref]);
                } catch {
                    // Local branch already exists → just switch to it.
                    await git.raw(["switch", short]);
                }
                break;
            }
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}
```

### 3. IPC enum + signature — `src/ipc/api-types.ts`

- Add `GitSwitchTarget` to the `git-ipc` import.
- Add `gitSwitch = "gitSwitch",` to the `Endpoint` enum (after `gitRefs`).
- Add to the `Api` type: `[Endpoint.gitSwitch]: (dir: string, target: GitSwitchTarget) => Promise<GitMutationResult>;`

### 4. Controller — `src/ipc/main/controller.ts`

- Add `GitSwitchTarget` to the `../git-ipc` import.
- Add the handler after `gitRefs`:

```ts
gitSwitch = async (_event: IpcMainEvent, dir: string, target: GitSwitchTarget) => {
    const { switchTo } = await import("../../main/git-service");
    return switchTo(dir, target);
};
```

- Register it in `init()`: `bindEndpoint(Endpoint.gitSwitch, controllerInstance.gitSwitch);`

### 5. Renderer IPC — `src/ipc/renderer/api.ts`

- Add `GitSwitchTarget` to the `../git-ipc` import.
- Add after `gitRefs`:

```ts
gitSwitch = async (dir: string, target: GitSwitchTarget) => {
    return executeOnce<GitMutationResult>(Endpoint.gitSwitch, dir, target);
};
```

### 6. Renderer git API — `src/renderer/api/git.ts`

- Add `GitSwitchTarget` to the `../../ipc/git-ipc` import.
- Add to the `git` object:

```ts
/**
 * Switch HEAD to a branch / remote branch / commit / tag (EPIC-031 / US-636).
 * Returns `{ ok:true }` (no-op) when git is off or no root; on failure resolves
 * to `{ ok:false, error }` so the model can toast. Never throws.
 */
switchTo(repoRoot: string, target: GitSwitchTarget): Promise<GitMutationResult> {
    if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve({ ok: true });
    return api.gitSwitch(repoRoot, target).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
},
```

### 7. Editor model action — `src/renderer/editors/git-tree/GitTreeEditorModel.ts`

Both surfaces live under this editor, so the action belongs here (not on a submodel). Add `GitSwitchTarget`
to the `git-ipc` import and `ui` (`../../api/ui`) + `git` (`../../api/git`) imports, then:

```ts
/** Switch HEAD to a branch / remote branch / commit / tag (US-636). No confirmation
 *  — every switch is frictionless (a dirty tree that git refuses just toasts). A
 *  commit/tag switch leaves a detached HEAD; helping the user create a branch from
 *  that state is a future task (handled in the commit dialog). Refreshes on success
 *  for immediate feedback; the US-624 watcher also fires. */
switchTo = async (target: GitSwitchTarget): Promise<void> => {
    const repoRoot = this.state.get().repoRoot;
    if (!repoRoot) return;
    const r = await git.switchTo(repoRoot, target);
    if (!r.ok) void ui.notify(`Failed to switch: ${r.error ?? "unknown error"}`, "error");
    this.refresh();
};
```

> No `showConfirmationDialog` import needed — every switch proceeds directly.

### 8. Commit-grid pass-through prop — `src/renderer/components/git-tree/GitTree.tsx`

- Import `MenuItem`: `import type { MenuItem } from "../../uikit/Menu";`
- Add to `GitTreeProps`:

```ts
/** Per-selection context menu for commit rows (US-636). Returns the items for the
 *  current grid selection; `undefined`/`[]` suppresses the menu. Only the whole-repo
 *  editor passes this — the file-scoped popovers/History panel omit it. */
getContextMenuItems?: (rows: GitCommitRow[]) => MenuItem[];
```

- Destructure `getContextMenuItems` in the component params and forward to `AVGrid`:

```tsx
<AVGrid<GitCommitRow>
    …
    extraElement={loadMore}
    getContextMenuItems={getContextMenuItems}
/>
```

### 9. Build the commit-grid menu — `src/renderer/editors/git-tree/GitTreeEditorView.tsx`

Add a `getContextMenuItems` builder (memoized on `model`) and pass it to `<GitTree>`. It reads the
right-clicked/selected commit row and offers a Switch item per ref plus a "Switch to Commit":

`AVGrid` calls this with the current grid **selection** rows. `FocusModel` collapses a right-click to the
single clicked row UNLESS the click lands inside an existing multi-row range (then it keeps the range). So:
a single right-click → exactly one row (no "click first" needed); a right-click inside a multi-select range →
several rows. **Switch targets a single commit**, so when more than one row is selected the items are shown
**disabled** (per the resolved Concern #6). The menu is always built from `rows[0]`.

**De-duplication rule:** a branch / tag is just a pointer to this commit, so switching to a local branch lands
on the same commit (on a branch — the preferred outcome). So when a **local branch** points here, offer ONLY
the branch switch(es); **"Switch to Commit"** (detached HEAD) appears only when **no** local branch is here
(covers the tag-only and bare-commit cases). **Tags are not listed separately on the grid** — "Switch to
Commit" already lands on the tagged commit. Remote branches stay listed (creating a tracking branch is a
distinct action). So `TagIcon` is **not** imported here.

```tsx
import type { MenuItem } from "../../uikit/Menu";
import type { GitCommitRow } from "../../components/git-tree";
import { GitIcon, GlobeIcon } from "../../theme/icons";

const commitContextMenu = useCallback(
    (rows: GitCommitRow[]): MenuItem[] => {
        const row = rows[0];
        if (!row || row.recordType !== "commit") return [];
        const multi = rows.length > 1;   // switch is single-commit → disable on multi (Concern #6)
        const items: MenuItem[] = [];
        let hasLocalBranch = false;
        for (const ref of row.refs) {
            if (ref.kind === "head") {
                hasLocalBranch = true;
                items.push({ label: `Switch to Branch '${ref.name}' (current)`, icon: <GitIcon />, disabled: true });
            } else if (ref.kind === "branch") {
                hasLocalBranch = true;
                items.push({ label: `Switch to Branch '${ref.name}'`, icon: <GitIcon />, disabled: multi, onClick: () => void model.switchTo({ type: "branch", name: ref.name }) });
            }
        }
        for (const ref of row.refs) {
            if (ref.kind === "remote") {
                items.push({ label: `Switch to Remote Branch '${ref.name}'`, icon: <GlobeIcon />, disabled: multi, onClick: () => void model.switchTo({ type: "remote", ref: ref.name }) });
            }
        }
        if (!hasLocalBranch) {
            items.push({
                label: `Switch to Commit ${row.shortHash}`,
                icon: <GitIcon />,
                startGroup: items.length > 0,
                disabled: multi,
                onClick: () => void model.switchTo({ type: "commit", hash: row.hash }),
            });
        }
        return items;
    },
    [model],
);
```

Pass it on the editor's `<GitTree>` only (the body branch that renders the grid):

```tsx
<GitTree
    model={model.gitTree}
    selectedHash={selectedHash}
    onSelectCommit={setSelectedHash}
    initialColumnLayout={model.state.get().columnLayout}
    onColumnLayoutChange={model.setColumnLayout}
    getContextMenuItems={commitContextMenu}
/>
```

> `useCallback` is already imported? **No** — `GitTreeEditorView` imports `useEffect, useRef, useState`. Add
> `useCallback` to that import.

### 10. Build the panel menu — `src/renderer/editors/git-tree/GitBranchesSecondaryView.tsx`

Add `MenuItem` + the icon imports, and wire `getContextMenu` on `<Tree>`. Uses the exact right-clicked node:

```tsx
import type { MenuItem } from "../../uikit/Menu";
// extend the existing icons import with GlobeIcon (already imported) — add nothing new there.

const getContextMenu = useCallback(
    (node: GitRefNode): MenuItem[] | undefined => {
        if (node.kind === "branch" && node.refName) {
            const isCurrent = node.refName === refs.current;
            return [{
                label: `Switch to Branch '${node.refName}'${isCurrent ? " (current)" : ""}`,
                icon: <GitIcon width={ICON_SIZE} height={ICON_SIZE} />,
                disabled: isCurrent,
                onClick: () => void model.switchTo({ type: "branch", name: node.refName! }),
            }];
        }
        if (node.kind === "remote-branch" && node.refName) {
            return [{
                label: `Switch to Remote Branch '${node.refName}'`,
                icon: <GlobeIcon width={ICON_SIZE} height={ICON_SIZE} />,
                onClick: () => void model.switchTo({ type: "remote", ref: node.refName! }),
            }];
        }
        if (node.kind === "tag" && node.refName) {
            // A tag is just a pointer to a commit — switching detaches HEAD at the tagged commit.
            return [{
                label: `Switch to Tag '${node.refName}' Commit`,
                icon: <TagIcon width={ICON_SIZE} height={ICON_SIZE} />,
                onClick: () => void model.switchTo({ type: "tag", name: node.refName! }),
            }];
        }
        return undefined; // roots / folders → no menu
    },
    [model, refs.current],
);
```

Add `getContextMenu={getContextMenu}` to the `<Tree<GitRefNode>>` props.

### 11. Active-commit (HEAD) highlight — `src/renderer/components/git-tree/GitTree.tsx`

So the active commit stays visible after a detached-HEAD switch (Concern #8), color the short-hash green on
the HEAD commit row. Import `REF_COLOR` alongside `RefBadge`, add a styled span, and branch `hashFormatter`:

```tsx
import { RefBadge, REF_COLOR } from "./RefBadge";

// The HEAD commit's short-hash reads green (matches the green current-branch label),
// so the active commit is marked even when HEAD is detached (no branch label). US-636.
const HeadHash = styled.span({ color: REF_COLOR.head }, { label: "GitTreeHeadHash" });

const hashFormatter: TCellFormater = (props) => {
    const r = rowOf(props);
    if (!r) return null;
    const content = <TruncatedText>{r.shortHash}</TruncatedText>;
    const isHead = r.recordType === "commit" && r.refs.some((ref) => ref.kind === "head");
    return isHead ? <HeadHash>{content}</HeadHash> : content;
};
```

> `TruncatedText` inherits color from its parent, so wrapping it in `HeadHash` tints the hash green without
> passing `style`/`color` into the UIKit primitive (Rule 7 stays satisfied). `GitTree` is `components/` app
> code where Emotion on its own elements is allowed (it already uses `styled` for `SpecialSubject` etc.).

> **Note on `node.refName!`:** the project bans defensive `!` (no `strictNullChecks`), but here it sits inside
> a `&& node.refName` narrow — TS already knows it's defined, so write `node.refName` without the `!`
> (the narrowed type flows into the arrow). Keep the inner reference plain: `name: node.refName`.

## Concerns / Open questions

1. ~~**`git switch` version floor (git ≥ 2.23).**~~ **RESOLVED — use `git switch`.** The 2.23 floor (Aug 2019)
   is accepted. No `git checkout` fallback. (Dev machine runs git 2.51.2, well above the floor.)
2. ~~**Remote-branch DWIM ambiguity.**~~ **RESOLVED — OK as-is.** `git switch -c <short> --track <ref>` is
   explicit even when two remotes share a branch name (we pass the full `origin/x` ref). The fallback
   `git switch <short>` (when the local branch already exists) lands on the existing local branch and does
   **not** re-point tracking — matching Git Extensions' "checkout existing local branch" behavior.
3. ~~**Dirty working tree.**~~ **RESOLVED — toast-only.** v1 surfaces git's own error via a toast (no
   auto-stash). A future "stash → switch → pop" or "Discard & switch" is **out of scope** (candidate for the
   US-625 small-enhancements log or a follow-up).
4. ~~**Detached-HEAD confirmation.**~~ **RESOLVED — no confirmation anywhere.** Switching to a commit/tag is a
   normal, expected action, so it proceeds directly (no dialog) just like branch switches. Helping the user
   out of detached HEAD — proposing "create a branch" from the **commit dialog** when HEAD is detached — is a
   **separate future task**, not part of US-636.
5. ~~**Tags in scope.**~~ **RESOLVED — panel only.** A tag is just a pointer to a commit, so there is no
   distinct "switch to tag" — it detaches HEAD at the tagged commit, identical to "Switch to Commit". So:
   - **Commit grid:** no tag item; "Switch to Commit" already lands on the tagged commit.
   - **Branches & Tags panel:** the tag leaf keeps a switch item, relabeled **"Switch to Tag '<name>' Commit"**
     (the `{ type: "tag" }` `--detach` path), so the user understands it lands on that commit.
6. ~~**Commit-grid right-click selection.**~~ **RESOLVED — verified + disable-on-multi.** `FocusModel`
   (`updateFocus`, lines 273–278) collapses a right-click to the single clicked row unless the click is inside
   an existing multi-row range (then it preserves the range). So a cold right-click already targets the row
   (no "click first" needed). **Rule:** the menu builds from `rows[0]`; when `rows.length > 1` every Switch
   item is `disabled` (switch is single-commit). The current branch's item is always disabled and labeled
   "(current)".
7. ~~**No new toolbar/buttons.**~~ **RESOLVED — context-menu-only.** The "Branches & Tags" header keeps its
   existing buttons (US-635). No double-click-to-switch (avoids accidental checkouts).
8. ~~**Active-commit highlight in detached HEAD.**~~ **RESOLVED — green HEAD hash.** Today the current branch
   reads green in the subject column (US-635); other branches read blue. After "Switch to Commit", HEAD is
   detached and there is no branch label to color, so nothing marks the active commit. **Fix:** color the
   **short-hash green** (`REF_COLOR.head`) on the HEAD commit row — i.e. whenever the row carries a
   `kind: "head"` decoration ref (which is present both on a branch, `HEAD -> main`, and when detached, bare
   `HEAD`). This is a `GitTree` component change, so it also marks HEAD in the file-scoped views (popovers /
   File History) — harmless and consistent.

## Files changed

| File | Change |
|------|--------|
| `src/ipc/git-ipc.ts` | New `GitSwitchTarget` union type; new `GitLogOptions.all` flag (`git log --all`) |
| `src/main/git-service.ts` | New `switchTo(dir, target)` (`git switch` / `--detach` / `-c --track`); **fix:** `log()` uses `--decorate=full` and `parseDecorations` classifies by ref namespace (`refs/heads/` vs `refs/remotes/` vs `refs/tags/`) so a slashed local branch like `feature/api` is `branch`, not `remote`; `log()` adds `--all` when `opts.all` |
| `src/renderer/components/git-tree/GitTreeModel.ts` | `reload`/`loadMore`/`loadAll` pass `all: !this.file` so the whole-repo Git Tree walks all refs (`--all`); file-scoped history keeps the HEAD/`--follow` walk |
| `src/ipc/api-types.ts` | `Endpoint.gitSwitch` + `Api` signature; import `GitSwitchTarget` |
| `src/ipc/main/controller.ts` | `gitSwitch` handler + `bindEndpoint`; import `GitSwitchTarget` |
| `src/ipc/renderer/api.ts` | `gitSwitch` IPC call; import `GitSwitchTarget` |
| `src/renderer/api/git.ts` | `git.switchTo(repoRoot, target)`; import `GitSwitchTarget` |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | `switchTo` action (detached-HEAD confirm + toast + refresh) |
| `src/renderer/components/git-tree/GitTree.tsx` | New `getContextMenuItems` prop forwarded to `AVGrid` (import `MenuItem`); green short-hash on the HEAD commit row (`HeadHash` styled span, import `REF_COLOR`) |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | `commitContextMenu` builder → `<GitTree getContextMenuItems>`; import `useCallback`, `MenuItem`, `GitCommitRow`, icons |
| `src/renderer/editors/git-tree/GitBranchesSecondaryView.tsx` | `getContextMenu` on `<Tree>`; import `MenuItem` |

## Files that need NO change
- `src/renderer/components/git-tree/GitChangesModel.ts`, `GitBranchesModel.ts` — unaffected; the switch action
  lives on the editor model. (`GitTreeModel.ts` IS touched — it passes `all: !this.file` to the log walk.)
- `src/renderer/components/git-tree/git-refs-tree.ts` — `GitRefNode` already carries `kind` + `refName`.
- `src/renderer/components/git-tree/swimlane-layout.ts` — `GitCommitRow` already carries `hash`/`shortHash`/`refs`.
- `src/renderer/components/git-tree/index.ts` — `GitCommitRow` is already exported (used by the view); confirm
  during implementation, add the type export only if missing.
- `src/renderer/uikit/Tree/*`, `src/renderer/uikit/AVGrid/*` — the `getContextMenu` / `getContextMenuItems`
  hooks already exist; this task only wires them.
- `register-editors.ts`, `secondary-view-registry.ts` — no registration changes.

## Acceptance criteria
- [ ] Right-clicking a commit in the Git Tree grid offers a "Switch to Branch '…'" per local branch (the
      current branch disabled as "(current)") and "Switch to Remote Branch '…'" per remote ref. "Switch to
      Commit `<shortHash>`" is offered only when **no** local branch points at the commit (so a commit with a
      branch is never duplicated); tags are not listed separately on the grid.
- [ ] Right-clicking a branch / remote branch / tag leaf in the "Branches & Tags" panel offers the matching
      Switch item ("Switch to Tag '<name>' Commit" for tags); the current branch is disabled. Roots/folders
      show no Switch item.
- [ ] Choosing "Switch to Branch"/"Remote Branch" checks out the branch (remote creates a local tracking
      branch named after the remote branch); the grid + panels refresh and the green head marker moves.
- [ ] "Switch to Commit" / panel "Switch to Tag '…' Commit" detaches HEAD at that commit (no confirmation).
- [ ] A switch that git refuses (e.g. dirty tree) surfaces an error toast and leaves HEAD unchanged.
- [ ] The HEAD commit's short-hash reads green in the "Commit" column — on a branch (alongside the green
      branch label) and after "Switch to Commit" (detached HEAD, where it's the only active-commit marker).
- [ ] The whole-repo Git Tree shows all branches' commits (`--all`) — switching to a branch behind another
      (e.g. `develop` while `main` is ahead) keeps the full history visible; file-scoped history is unchanged.
- [ ] A local branch whose name contains a slash (e.g. `feature/api`) is treated as a **local branch**
      everywhere — its commit decoration is `kind: "branch"` (correct ref-badge color) and its grid menu shows
      "Switch to Branch", not "Switch to Remote Branch".
- [x] `npx tsc --noEmit` clean; `npx eslint` clean on all changed files.
