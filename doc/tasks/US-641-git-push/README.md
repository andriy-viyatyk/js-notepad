# US-641: Git Push

**Epic:** EPIC-031  
**Depends on:** none (this task introduces the shared foundation Pull reuses)  
**Blocks:** US-642 (Git Pull)

---

## Goal

Add Push support to the Git Tree UI — including first-push set-upstream (`-u`) for brand-new branches, a "Commit and Push" path from the Commit dialog — and deliver the shared fetch + ahead/behind indicators + auth-env + progress-feedback foundation that US-642 (Pull) builds on.

---

## Background

### Pattern: env variable injection in git-service.ts (CRITICAL)

`git-service.ts` (line 179) sets `GIT_OPTIONAL_LOCKS=0` using the **two-argument** `.env(name, value)` form of simple-git:

```typescript
const s = await simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0").status();
```

The JSDoc at line 176–178 explicitly explains why: _"the single-object form would replace [the env]; the two-arg `.env(name, value)` SUPPLEMENTS the inherited process env (PATH etc.)"_.

All three new functions (`fetch`, `aheadBehind`, `push`) MUST set `GIT_TERMINAL_PROMPT=0` using the same two-argument form. For functions that also need `GIT_OPTIONAL_LOCKS=0`, chain both calls:

```typescript
simpleGit(dir)
    .env("GIT_OPTIONAL_LOCKS", "0")
    .env("GIT_TERMINAL_PROMPT", "0")
```

Do NOT use the single-object `.env({...process.env, GIT_TERMINAL_PROMPT: "0"})` form — it would replace the inherited env and break PATH resolution on macOS/Linux.

### Pattern: never-throw service functions

Every function in `git-service.ts` catches all errors and returns a typed result. Push follows `commit()` (line 414) as the template — catch, return `{ ok: false, error: String(e) }`.

### Pattern: dynamic import in controller.ts

Every git handler in `controller.ts` (lines 244–317) lazy-imports from `../../main/git-service` inside the handler body:

```typescript
gitFetch = async (_event: IpcMainEvent, dir: string, remote?: string) => {
    const { fetch } = await import("../../main/git-service");
    return fetch(dir, remote);
};
```

### Pattern: renderer git API wrappers

`src/renderer/api/git.ts` (lines 26–191): every wrapper guards on `settings.get("git.enabled")` and `repoRoot`, then calls the corresponding `api.*` method with a `.catch()` fallback to a safe zero value. Example template — `commit()` at line 151.

### Pattern: GitChangesModel operations

`GitChangesModel.ts` (line 155): `commit()` returns `Promise<boolean>` (true = succeeded). The JSDoc at line 153 already says _"Returns whether it succeeded — the future push step keys off this."_ Push should follow this same return convention.

`GitChangesModel` has `repoRoot` as a private field. New methods needing it mirror the existing pattern: guard `if (!this.repoRoot) return ...`.

### Pattern: GitBranchesModel.reload()

`GitBranchesModel.ts` (lines 67–96): `reload()` probes then fetches refs; the `_stale` flag and `disposed` guard are both applied. The new `fetch()` method follows the same structure.

### Pattern: GitTreeEditorView.tsx toolbar (`<PageToolbar rightContributions>`)

`GitTreeEditorView.tsx` (lines 165–185) renders a `<PageToolbar>` with:
- `rightContributions={...}` — currently holds ONE `<IconButton name="git-tree-refresh" ... icon={<RefreshIcon/>} disabled={loading} onClick={() => model.refresh()} />` (lines 169–178). The new Fetch and Push buttons go BEFORE this Refresh button (order: Fetch → Push → Refresh).
- Children — the repo name `<Text color="light" nowrap title={repoRoot}>{model.repoName}</Text>` (lines 182–184). The ahead/behind badge is appended after this Text in the children slot.

The component reads state via `model.gitTree.state.use(...)` (lines 36–40). A second hook `model.branches.state.use(...)` reads `aheadBehind`, `pushing`, `fetching`. Icons imported from `../../theme/icons` (line 10): currently `RefreshIcon, GitIcon, GlobeIcon`. Add `DownloadIcon` (Fetch), `UploadIcon` (Push) to this import. `UploadIcon` is added to `icons.tsx` as a vertical mirror of `DownloadIcon` (arrow out of a tray) so Push reads as the counterpart of Fetch — the bare `ArrowUpIcon` chevron looked like an expand/collapse control. Color tokens come from `../../theme/color` — use `color.text.light` for `↑ahead`, `color.warning.text` for `↓behind` (no hardcoded colors).

### Pattern: CommitDialog buttons prop

`CommitDialog.tsx` **must be modified** in this task. The relevant anchors:

- **`branchChanged` (line 127):** `const branchChanged = !!state.branch?.trim() && state.branch.trim() !== (state.originalBranch ?? "");`
- **Button map (lines 183–193):** the footer iterates `buttons` and currently relabels only the `"Commit"` button (line ~190):
  ```tsx
  {bt === "Commit" && branchChanged ? "Create Branch & Commit" : bt}
  ```
  This handles only one button. It must be **generalized** so `"Commit & Push"` also relabels (to `"& Push"`) when `branchChanged` is true.
- **`buttons?` JSDoc (lines 26–30):** currently references `"Commit and Push"` — must be updated to `"Commit & Push"` (ampersand form) and must mention the push button's `"& Push"` relabel.
- **`model.submit(bt)` (line 189):** passes the original array label unchanged, so `CommitResult.button` equals the array value the caller passed — the identity is preserved even when the visible text relabels.
- **Ctrl+Enter (line 79):** picks `s.buttons?.find((b) => b !== "Cancel") ?? "Commit"` — fires the first non-Cancel button (`"Commit"`), committing **without** push. See Concern 8.

`CommitResult.button` carries the clicked button label. `onAction` in `GitChangesSecondaryView.tsx` must branch on `result.button === "Commit & Push"` (ampersand form) to trigger push.

### Existing IPC scaffolding

`Endpoint` enum lives in `src/ipc/api-types.ts` (lines 15–77). The last git entry is `gitCreateBranch` at line 76. New entries append after it.

`Api` interface lives in the same file (lines 85–153). The last git entry is `gitCreateBranch` at line 152.

`ApiCalls` class lives in `src/ipc/renderer/api.ts` (lines 52–305). Last git method: `gitCreateBranch` at line 302.

`Controller` class in `src/ipc/main/controller.ts` (lines 26–318). Last git handler: `gitCreateBranch` at line 314. `bindEndpoint` registrations in `init()` end at line 396.

---

## Implementation Plan

### Step 1 — DTOs in `src/ipc/git-ipc.ts`

Add after the existing `GitRefs` block (after line 105):

```typescript
/** Options for `git fetch` (US-641). */
export interface GitFetchOptions {
    /** Fetch only this remote; omit → fetch all remotes (`--all`). */
    remote?: string;
}

/** Ahead/behind counts for the current branch vs its upstream (US-641).
 *  `hasUpstream: false` when the branch has no configured upstream — not an error. */
export interface GitAheadBehind {
    ahead: number;
    behind: number;
    /** Full upstream ref, e.g. "origin/main". Present only when `hasUpstream` is true. */
    upstream?: string;
    hasUpstream: boolean;
}

/** Options for `git push` (US-641). */
export interface GitPushOptions {
    /** Remote name. Defaults to "origin" (or the sole configured remote). */
    remote?: string;
    /** Local branch to push. Defaults to the current branch. */
    branch?: string;
    /** Pass `-u` to set the upstream tracking reference (first push of a new branch). */
    setUpstream?: boolean;
}

/** Result of a `git push` operation (US-641). Extends `GitMutationResult`
 *  with a rejection flag for non-fast-forward pushes. */
export interface GitPushResult {
    ok: boolean;
    error?: string;
    /** True when git rejected the push because the remote has commits the local
     *  branch does not — the user must fetch/pull before pushing. Never auto-force. */
    rejected?: boolean;
}
```

### Step 2 — Service functions in `src/main/git-service.ts`

Add the import for the new DTOs at line 14 (extend the existing import):

```typescript
import type { ..., GitFetchOptions, GitAheadBehind, GitPushOptions, GitPushResult } from "../ipc/git-ipc";
```

Add three functions after `createBranch` (after line 502):

```typescript
/**
 * Fetch remote-tracking branches (US-641). When `opts.remote` is given, fetch
 * only that remote; otherwise `--all --prune`. Sets GIT_TERMINAL_PROMPT=0 so
 * HTTPS without a helper fails fast rather than hanging. Never throws.
 */
export async function fetch(dir: string, opts: GitFetchOptions = {}): Promise<GitMutationResult> {
    try {
        const git = simpleGit(dir).env("GIT_TERMINAL_PROMPT", "0");
        if (opts.remote) {
            await git.raw(["fetch", "--prune", opts.remote]);
        } else {
            await git.raw(["fetch", "--all", "--prune"]);
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}

/**
 * Ahead/behind count for the current branch vs its upstream (US-641).
 * Uses `rev-list --left-right --count @{upstream}...HEAD`:
 *   left count  = commits on upstream not on HEAD = "behind"
 *   right count = commits on HEAD not on upstream = "ahead"
 * Returns `{ hasUpstream: false }` gracefully when there is no upstream
 * (new/local-only branch). Never throws.
 */
export async function aheadBehind(dir: string): Promise<GitAheadBehind> {
    try {
        const git = simpleGit(dir).env("GIT_OPTIONAL_LOCKS", "0").env("GIT_TERMINAL_PROMPT", "0");
        // Get the upstream name for display.
        let upstream: string | undefined;
        try {
            upstream = (await git.raw(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])).trim();
        } catch {
            // No upstream configured.
            return { ahead: 0, behind: 0, hasUpstream: false };
        }
        const raw = (await git.raw(["rev-list", "--left-right", "--count", "@{upstream}...HEAD"])).trim();
        const parts = raw.split(/\s+/);
        const behind = parseInt(parts[0] ?? "0", 10) || 0;
        const ahead = parseInt(parts[1] ?? "0", 10) || 0;
        return { ahead, behind, upstream, hasUpstream: true };
    } catch {
        return { ahead: 0, behind: 0, hasUpstream: false };
    }
}

/**
 * Push the current (or specified) branch to its upstream remote (US-641).
 * When `opts.setUpstream` is true, passes `-u <remote> <branch>` to set the
 * tracking reference — required for a first push of a new branch. The remote
 * defaults to "origin"; when origin is absent falls back to the single
 * configured remote. Never force-pushes. A non-fast-forward rejection is
 * surfaced as `{ ok:false, rejected:true }` — the user must fetch/pull first.
 * Sets GIT_TERMINAL_PROMPT=0 so HTTPS without credentials fails fast. Never throws.
 */
export async function push(dir: string, opts: GitPushOptions = {}): Promise<GitPushResult> {
    try {
        const git = simpleGit(dir).env("GIT_TERMINAL_PROMPT", "0");

        // Resolve the remote: use opts.remote if given, else "origin", else the sole remote.
        let remote = opts.remote;
        if (!remote) {
            try {
                const remoteList = (await simpleGit(dir).raw(["remote"])).split("\n").map((l) => l.trim()).filter(Boolean);
                remote = remoteList.includes("origin") ? "origin" : remoteList[0];
            } catch {
                remote = "origin";
            }
        }

        // Resolve the branch: use opts.branch if given, else the current branch.
        let branch = opts.branch;
        if (!branch) {
            try {
                const head = (await simpleGit(dir).raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim();
                branch = head && head !== "HEAD" ? head : undefined;
            } catch {
                // ignore
            }
        }

        if (opts.setUpstream && remote && branch) {
            await git.raw(["push", "-u", remote, branch]);
        } else if (remote && branch) {
            await git.raw(["push", remote, branch]);
        } else {
            await git.raw(["push"]);
        }
        return { ok: true };
    } catch (e) {
        const msg = String(e);
        // Detect non-fast-forward rejection — git outputs "[rejected]" and
        // "fetch first" / "cannot fast-forward" in the error stream.
        const rejected = /\[rejected\]|fetch first|cannot fast.forward|non-fast-forward/i.test(msg);
        return { ok: false, error: msg, rejected };
    }
}
```

### Step 3 — Endpoint enum and Api interface in `src/ipc/api-types.ts`

Add to the `Endpoint` enum after `gitCreateBranch` (after line 76):

```typescript
    gitFetch = "gitFetch",
    gitAheadBehind = "gitAheadBehind",
    gitPush = "gitPush",
```

Update the import at line 13 to include the new DTOs:

```typescript
import { ..., GitFetchOptions, GitAheadBehind, GitPushOptions, GitPushResult } from "./git-ipc";
```

Add to the `Api` interface after the `gitCreateBranch` entry (after line 152):

```typescript
    [Endpoint.gitFetch]: (dir: string, opts?: GitFetchOptions) => Promise<GitMutationResult>;
    [Endpoint.gitAheadBehind]: (dir: string) => Promise<GitAheadBehind>;
    [Endpoint.gitPush]: (dir: string, opts?: GitPushOptions) => Promise<GitPushResult>;
```

### Step 4 — Controller handlers in `src/ipc/main/controller.ts`

Update the import at line 16 to include `GitFetchOptions` and `GitPushOptions`:

```typescript
import { GitIdentity, GitLogOptions, GitSwitchTarget, GitFetchOptions, GitPushOptions } from "../git-ipc";
```

Add three handler methods after `gitCreateBranch` (after line 317, before the closing `}`):

```typescript
    gitFetch = async (_event: IpcMainEvent, dir: string, opts?: GitFetchOptions) => {
        const { fetch } = await import("../../main/git-service");
        return fetch(dir, opts);
    };

    gitAheadBehind = async (_event: IpcMainEvent, dir: string) => {
        const { aheadBehind } = await import("../../main/git-service");
        return aheadBehind(dir);
    };

    gitPush = async (_event: IpcMainEvent, dir: string, opts?: GitPushOptions) => {
        const { push } = await import("../../main/git-service");
        return push(dir, opts);
    };
```

Add `bindEndpoint` registrations in `init()` after `gitCreateBranch` (after line 396, before `initRendererEvents()`):

```typescript
    bindEndpoint(Endpoint.gitFetch, controllerInstance.gitFetch);
    bindEndpoint(Endpoint.gitAheadBehind, controllerInstance.gitAheadBehind);
    bindEndpoint(Endpoint.gitPush, controllerInstance.gitPush);
```

### Step 5 — ApiCalls in `src/ipc/renderer/api.ts`

Update the import at line 14 to include the new DTOs:

```typescript
import { ..., GitFetchOptions, GitAheadBehind, GitPushOptions, GitPushResult } from "../git-ipc";
```

Add three methods to `ApiCalls` after `gitCreateBranch` (after line 304):

```typescript
    gitFetch = async (dir: string, opts?: GitFetchOptions) => {
        return executeOnce<GitMutationResult>(Endpoint.gitFetch, dir, opts);
    };

    gitAheadBehind = async (dir: string) => {
        return executeOnce<GitAheadBehind>(Endpoint.gitAheadBehind, dir);
    };

    gitPush = async (dir: string, opts?: GitPushOptions) => {
        return executeOnce<GitPushResult>(Endpoint.gitPush, dir, opts);
    };
```

### Step 6 — Renderer git wrapper in `src/renderer/api/git.ts`

Add DTOs to the import at line 15:

```typescript
import type { ..., GitFetchOptions, GitAheadBehind, GitPushOptions, GitPushResult } from "../../ipc/git-ipc";
```

Add a safe fallback constant near the top (after line 19):

```typescript
const NO_UPSTREAM: GitAheadBehind = { ahead: 0, behind: 0, hasUpstream: false };
const PUSH_FAIL: GitPushResult = { ok: false, error: "git disabled" };
```

Add three methods to the `git` object after `createBranch` (after line 190):

```typescript
    /**
     * Fetch remote-tracking branches (US-641). Fetches all remotes when `opts.remote`
     * is omitted. Returns `{ ok:true }` (no-op) when git is off or no root given.
     * Never throws.
     */
    fetch(repoRoot: string, opts?: GitFetchOptions): Promise<GitMutationResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve({ ok: true });
        return api.gitFetch(repoRoot, opts).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
    },

    /**
     * Ahead/behind count for the current branch vs its upstream (US-641). Returns
     * `{ hasUpstream: false }` (no-op) when git is off, no root, or the branch has no
     * upstream. Never throws.
     */
    aheadBehind(repoRoot: string): Promise<GitAheadBehind> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(NO_UPSTREAM);
        return api.gitAheadBehind(repoRoot).catch((): GitAheadBehind => NO_UPSTREAM);
    },

    /**
     * Push the current branch to its upstream remote (US-641). When the branch has
     * no upstream, pass `opts.setUpstream=true` to set it. Never force-pushes. Returns
     * `{ ok:false }` (no-op) when git is off or no root given. Never throws.
     */
    push(repoRoot: string, opts?: GitPushOptions): Promise<GitPushResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(PUSH_FAIL);
        return api.gitPush(repoRoot, opts).catch((e): GitPushResult => ({ ok: false, error: String(e) }));
    },
```

### Step 7 — GitBranchesModel: fetch, push, ahead/behind

**File:** `src/renderer/components/git-tree/GitBranchesModel.ts`

**7a. Extend `GitBranchesState`** (after line 22, inside the interface):

```typescript
    /** Ahead/behind counts for the current branch vs its upstream. */
    aheadBehind: GitAheadBehind;
    /** A push is in flight (drives the Push button busy state). */
    pushing: boolean;
    /** A fetch is in flight (drives the Fetch button busy state). */
    fetching: boolean;
```

**7b. Update the import** at line 18 to include `GitAheadBehind`:

```typescript
import type { GitRefs, GitAheadBehind } from "../../../ipc/git-ipc";
```

**7c. Update `defaultGitBranchesState`** (after line 29):

```typescript
const defaultGitBranchesState: GitBranchesState = {
    refs: EMPTY_REFS,
    loading: false,
    gitOk: true,
    aheadBehind: { ahead: 0, behind: 0, hasUpstream: false },
    pushing: false,
    fetching: false,
};
```

**7d. Extend `reload()`** to also load ahead/behind (after line 89 where `git.refs` is called):

```typescript
// Load refs and ahead/behind in parallel — both are cheap reads.
const [refs, ab] = await Promise.all([
    git.refs(this.repoRoot),
    git.aheadBehind(this.repoRoot),
]);
if (this.disposed) return;
this.write((s) => {
    s.gitOk = true;
    s.refs = refs;
    s.aheadBehind = ab;
    s.loading = false;
});
```

(Remove the old sequential `const refs = await git.refs(this.repoRoot)` line and the write block that follows it.)

**7e. Add `fetch()` method** (after `reload`):

```typescript
/** Fetch all remotes, then reload refs + ahead/behind (US-641).
 *  Sets `fetching` for the duration; toasts on failure. Never throws. */
fetch = async (): Promise<void> => {
    if (!this.repoRoot) return;
    this.write((s) => { s.fetching = true; });
    const r = await git.fetch(this.repoRoot);
    if (!r.ok) void ui.notify(`Failed to fetch: ${r.error ?? "unknown error"}`, "error");
    await this.reload();
    this.write((s) => { s.fetching = false; });
};
```

Add `import { ui } from "../../api/ui";` if not already imported (check the file — currently it only imports `settings` and `git`).

**7f. Add `push()` method** (after `fetch`):

```typescript
/** Push the current branch to its upstream (US-641). When there is no upstream,
 *  passes `setUpstream:true` to create one (`-u origin <branch>`). Sets `pushing`
 *  for the duration; toasts on failure or rejection. Reloads afterward. Never throws. */
push = async (): Promise<void> => {
    if (!this.repoRoot) return;
    const ab = this.state.get().aheadBehind;
    // Determine whether we need to set the upstream (-u).
    const setUpstream = !ab.hasUpstream;
    this.write((s) => { s.pushing = true; });
    const r = await git.push(this.repoRoot, { setUpstream });
    if (!r.ok) {
        const msg = r.rejected
            ? "Push rejected: fetch or pull first, then push again."
            : `Failed to push: ${r.error ?? "unknown error"}`;
        void ui.notify(msg, "error");
    }
    await this.reload();
    this.write((s) => { s.pushing = false; });
};
```

**7g. Add `reloadAheadBehind()` method** (after `push`):

```typescript
/** Cheap ahead/behind-only reload (US-641) — used by the editor toolbar's refresh
 *  when the tree is visible but the Branches panel is collapsed (so the full refs
 *  reload is skipped). Never throws. */
reloadAheadBehind = async (): Promise<void> => {
    if (!this.repoRoot) return;
    const ab = await git.aheadBehind(this.repoRoot);
    if (this.disposed) return;
    this.write((s) => { s.aheadBehind = ab; });
};
```

### Step 8 — GitTreeEditorModel: fetch/push convenience methods + refresh ahead/behind

**File:** `src/renderer/editors/git-tree/GitTreeEditorModel.ts`

**8a. Add `fetch()` and `push()` convenience methods** after the existing `switchTo`/`createBranchAt` delegation methods (mirroring their pattern: get repoRoot, call submodel method, then `this.refresh()`):

```typescript
/** Fetch all remotes, then refresh the graph + ahead/behind (US-641). Delegates
 *  busy state + toast to the branches submodel. */
fetch = async (): Promise<void> => {
    await this.branches.fetch();   // sets fetching, toasts on failure, reloads refs + ahead/behind
    this.refresh();                // reload the commit graph (new remote-tracking commits)
};

/** Push the current branch (US-641). Delegates upstream-detection + busy state +
 *  toast to the branches submodel, then refreshes the graph + ahead/behind. */
push = async (): Promise<void> => {
    await this.branches.push();
    this.refresh();
};
```

**8b. Modify `refresh()`** so that when the tree is visible it also reloads ahead/behind cheaply (keeping the toolbar counts live even when the Branches panel is collapsed):

```typescript
// before:
refresh = (): void => {
    if (this.isTreeVisible()) this.refreshTree(); else this.gitTree.markStale();
    if (this.isPanelVisible("git-changes")) this.refreshChanges(); else this.changes.markStale();
    if (this.isPanelVisible("git-branches")) this.refreshBranches(); else this.branches.markStale();
};
// after — add a cheap ahead/behind reload whenever the tree (hence the toolbar) is visible:
refresh = (): void => {
    if (this.isTreeVisible()) { this.refreshTree(); void this.branches.reloadAheadBehind(); }
    else this.gitTree.markStale();
    if (this.isPanelVisible("git-changes")) this.refreshChanges(); else this.changes.markStale();
    if (this.isPanelVisible("git-branches")) this.refreshBranches(); else this.branches.markStale();
};
```

Note: `branches` is configured on open via `syncGitTree()` (lines 260–261), so `reloadAheadBehind()` always has a `repoRoot`. The toolbar is only shown when `isTreeVisible()` is true, so the cheap call is always in scope when the toolbar renders.

### Step 9 — GitTreeEditorView: Fetch + Push toolbar buttons + ahead/behind badge

**File:** `src/renderer/editors/git-tree/GitTreeEditorView.tsx`

**9a. Read `aheadBehind`, `pushing`, `fetching` from branches state** inside the component, alongside the existing `model.gitTree.state.use(...)`:

```typescript
const { aheadBehind, pushing, fetching } = model.branches.state.use((s) => ({
    aheadBehind: s.aheadBehind,
    pushing: s.pushing,
    fetching: s.fetching,
}));
```

**9b. Toolbar layout — a grouped left cluster + Refresh on the right.** The repo
identity and its main remote actions form one visual group in `children`, closed by a
vertical `Divider`; only **Refresh** stays in `rightContributions` (far right). Left-to-right
the group is: `Repo:` label → repo-name **badge** (`Tag variant="outlined"`, full path on
hover) → ahead/behind badge → **Fetch** → **Push** → vertical **Divider**. US-642 inserts
**Pull** between Fetch and Push.

```typescript
rightContributions={
    <IconButton
        name="git-tree-refresh"
        size="sm"
        title="Refresh"
        icon={<RefreshIcon />}
        disabled={loading}
        onClick={() => model.refresh()}
    />
}
>
    <Panel direction="row" align="center" gap="sm">
        <Text color="light" nowrap>Repo:</Text>
        <Tag
            name="git-repo-name"
            variant="outlined"
            size="sm"
            label={model.repoName}
            title={model.state.get().repoRoot}
        />
        {(aheadBehind.ahead > 0 || aheadBehind.behind > 0) && (
            <Panel direction="row" gap="xs" align="center">
                {aheadBehind.ahead > 0 && <Text color={color.text.light} size="xs">{`↑${aheadBehind.ahead}`}</Text>}
                {aheadBehind.behind > 0 && <Text color={color.warning.text} size="xs">{`↓${aheadBehind.behind}`}</Text>}
            </Panel>
        )}
        <IconButton
            name="git-tree-fetch"
            size="sm"
            title="Fetch all remotes"
            icon={<DownloadIcon />}
            disabled={fetching}
            onClick={() => void model.fetch()}
        />
        {/* US-642 inserts the Pull button here, between Fetch and Push */}
        <IconButton
            name="git-tree-push"
            size="sm"
            title={
                !aheadBehind.hasUpstream ? "Push (set upstream)"
                : aheadBehind.ahead > 0 ? `Push ${aheadBehind.ahead} commit(s)`
                : "Nothing to push"
            }
            icon={<UploadIcon />}
            disabled={pushing || (aheadBehind.hasUpstream && aheadBehind.ahead === 0)}
            onClick={() => void model.push()}
        />
        <Divider name="git-toolbar-divider" orientation="vertical" />
    </Panel>
```

The Push button is enabled when there is no upstream (allows the first set-upstream push) and disabled only when there is an upstream with nothing ahead, or a push is in flight. The ahead/behind counts use `Text size="xs"` (the UIKit `Text` primitive has no `fontSize` prop).

**9c. Update imports** — add `DownloadIcon`, `UploadIcon` to the `../../theme/icons` import; add `Divider` (`../../uikit/Divider`), `Tag` (`../../uikit/Tag`), and `color` (`../../theme/color`).

### Step 10 — CommitDialog.tsx — generalize the branch-edit relabel to the push button

**File:** `src/renderer/ui/dialogs/CommitDialog.tsx`

**10a. Add a module-level helper** above the `CommitDialog` component (near the other module-level functions):

```tsx
/** Display label for an action button. When the branch field was edited the commit
 *  will create a new branch first, so the labels grow: "Commit" → "Create Branch &
 *  Commit" and "Commit & Push" → "& Push" (the latter reads as a continuation of the
 *  relabeled commit button just to its left). The action identity passed to
 *  `submit(bt)` is unchanged — only the visible text. */
function actionButtonLabel(bt: string, branchChanged: boolean): string {
    if (!branchChanged) return bt;
    if (bt === "Commit") return "Create Branch & Commit";
    if (bt === "Commit & Push") return "& Push";
    return bt;
}
```

**10b. Replace the inline ternary in the button map** (line ~190):

```tsx
// before:
{bt === "Commit" && branchChanged ? "Create Branch & Commit" : bt}

// after:
{actionButtonLabel(bt, branchChanged)}
```

**10c. Update the `buttons?` JSDoc** (lines 26–30) to reference the new value and relabel behavior. Example updated text:

> Action button labels. Default: `["Commit", "Cancel"]`. The push task passes
> `["Commit", "Commit & Push", "Cancel"]`. In `CommitResult.button`, the value
> equals the original array label (not the relabeled text). When the branch field
> is edited, `"Commit & Push"` relabels to `"& Push"` (reads as a continuation
> of `"Create Branch & Commit"` on its left).

### Step 11 — GitChangesSecondaryView: "Commit & Push" button

**File:** `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx`

**11a. Change `doCommit`** to pass the three-button array and branch on the result button:

```tsx
const doCommit = useCallback(async () => {
    const id = await model.changes.getIdentity();
    await showCommitDialog({
        branch,
        name: id.name,
        email: id.email,
        buttons: ["Commit", "Commit & Push", "Cancel"],
        onAction: async (result) => {
            if (result.button !== "Commit" && result.button !== "Commit & Push") return false;
            const newBranch = result.branch.trim() !== (branch ?? "") ? result.branch.trim() : undefined;
            const committed = await model.changes.commit(
                result.message,
                { name: result.name, email: result.email },
                newBranch,
            );
            if (!committed) return false;
            if (result.button === "Commit & Push") {
                await model.branches.push();
            }
            return true;
        },
    });
}, [model, branch]);
```

Note: in branch-edit mode the `"& Push"` button (relabeled from `"Commit & Push"`) performs create-branch + commit + push — branch creation is detected via `result.branch` differing from the original, exactly as the plain Commit path already does. `model.branches` is accessed here — `GitChangesSecondaryView` already receives the full `GitTreeEditorModel`, which owns `branches` as a public field (verify in `GitTreeEditorModel.ts`).

---

## Concerns / Open Questions

All of the following are **settled as deferred**; no decision needed before implementation starts.

1. **Multi-remote default.** When origin is absent and multiple remotes exist, the service picks `remoteList[0]` (first configured remote). A remote-picker UI is deferred. Document this in the `push()` JSDoc.

2. **Push tag nodes.** A "Push tag" item on tag nodes in the Branches panel context menu would be a small addition (`git push <remote> refs/tags/<name>`). Deferred — it requires a different push command form and UX is less clear (does the user expect to push just the tag or also the branch?). This would be a Branches-panel addition, not part of the toolbar.

3. **Secondary Fetch/Push affordances in the Branches panel** (header Fetch button, branch-node Push context item, per-node ahead/behind badge) are deferred — the Git Tree editor toolbar is the primary and only required home in v1.

4. **`--force-with-lease`.** Explicitly out of scope for v1. The Push function never passes `--force` or `--force-with-lease`. A rejected push is surfaced as a clear "fetch/pull first" message.

5. **Ahead/behind scope.** Current-branch only (one cheap `rev-list` call). All-branches ahead/behind (decorating every remote-tracking node) is deferred — it requires `N` calls or a custom `for-each-ref` format that isn't straightforward with simple-git.

6. **Streaming progress.** v1 uses busy state (the Fetch/Push button is disabled) + success/error toast. A real-time progress channel (simple-git `progress` event → IPC → renderer progress bar) is deferred. Note for future: simple-git supports `.outputHandler()` and the `progress` event on fetch/push operations.

7. **env merge mechanism confirmed.** The two-arg `.env(name, value)` call is the ONLY approved form in this codebase (per the JSDoc at `git-service.ts` line 176). Do not use single-object `.env({})` — it replaces the entire env.

8. **Commit dialog `Ctrl+Enter` with three buttons.** `CommitDialogModel.handleKeyDown` (line 79 of `CommitDialog.tsx`) picks `s.buttons?.find((b) => b !== "Cancel") ?? "Commit"` — this fires `"Commit"` (the first non-Cancel button in the array), committing **without** pushing. To push, the user must click the `"Commit & Push"` / `"& Push"` button explicitly. This behavior is acceptable for v1.

---

## Acceptance Criteria

- [ ] Pushing the current branch with an existing upstream sends commits to the remote and clears the ahead count in the badge.
- [ ] First push of a branch without an upstream sets the upstream (`-u`) and future pushes no longer set it.
- [ ] "Commit and Push" from the Commit dialog commits then pushes without reopening the dialog on success.
- [ ] HTTPS push without a credential helper fails fast (no hang) with a readable error toast; does not prompt interactively.
- [ ] Fetch updates remote-tracking branches visible in the Branches panel and refreshes the ahead/behind badge.
- [ ] Non-fast-forward push rejection shows "fetch/pull first" message, never auto-forces.
- [ ] When `git.enabled` is off, all three operations (fetch/push/aheadBehind) return immediately with no git spawn.
- [ ] Ahead/behind badge appears on the current branch node; `↑N` shows when ahead, `↓N` shows when behind, nothing when even.

---

## Files Changed

| File | Change |
|---|---|
| `src/renderer/theme/icons.tsx` | Add `UploadIcon` (vertical mirror of `DownloadIcon`) for the Push button |
| `src/ipc/git-ipc.ts` | Add `GitFetchOptions`, `GitAheadBehind`, `GitPushOptions`, `GitPushResult` DTOs |
| `src/main/git-service.ts` | Add `fetch()`, `aheadBehind()`, `push()` functions |
| `src/ipc/api-types.ts` | Add `Endpoint.gitFetch`, `.gitAheadBehind`, `.gitPush`; add `Api` signatures |
| `src/ipc/main/controller.ts` | Add `gitFetch`, `gitAheadBehind`, `gitPush` handler methods + `bindEndpoint` calls |
| `src/ipc/renderer/api.ts` | Add `gitFetch`, `gitAheadBehind`, `gitPush` to `ApiCalls` |
| `src/renderer/api/git.ts` | Add `fetch`, `aheadBehind`, `push` wrappers |
| `src/renderer/components/git-tree/GitBranchesModel.ts` | Extend state with `aheadBehind`/`pushing`/`fetching`; add `fetch()`, `push()`, `reloadAheadBehind()` methods; update `reload()` to load ahead/behind in parallel |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | Add `fetch()`, `push()` convenience methods; modify `refresh()` to call `branches.reloadAheadBehind()` when tree is visible |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | Toolbar left group (`children`): `Repo:` label + repo-name `Tag` badge + ahead/behind badge + Fetch + Push + vertical `Divider`; Refresh alone in `rightContributions`; reads `model.branches.state` for `aheadBehind`/`pushing`/`fetching` |
| `src/renderer/ui/dialogs/CommitDialog.tsx` | Generalize the branch-edit relabel (`actionButtonLabel` helper) so the push button shows `"Commit & Push"` / `"& Push"`; update `buttons?` JSDoc |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | Pass `buttons: ["Commit", "Commit & Push", "Cancel"]`; branch on `result.button` in `onAction` |

## Files That Need No Changes

- `src/renderer/components/git-tree/GitChangesModel.ts` — `commit()` already returns `boolean`; the push wiring lives in the view's `doCommit` callback calling `model.branches.push()`.
- `src/renderer/editors/git-tree/GitBranchesSecondaryView.tsx` — unchanged in v1; the toolbar is the primary home for Fetch/Push.
- `src/renderer/components/git-tree/git-refs-tree.ts` — refs tree builder is unchanged; no push/fetch logic lives there.
- `src/shared/types.ts`, `src/shared/link-data.ts` — unaffected.
- `src/renderer/api/ui.ts` — already imported in `GitChangesModel`; just ensure it's imported in `GitBranchesModel`.
