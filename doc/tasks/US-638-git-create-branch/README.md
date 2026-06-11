# US-638: Create branch (Git Tree grid context menu + Commit dialog)

**Epic:** [EPIC-031 — Git Functionality Enhancements (incremental)](../../epics/EPIC-031.md)
**Status:** ✅ Complete

## Goal

Add two ways to create a git branch from the Git Tree editor:

1. **"Create branch here"** context-menu action on the commit grid — creates a branch at the right-clicked commit (reusing the existing name-input dialog; invalid/duplicate names surface as a toast).
2. **Editable, required branch name in the Commit dialog** — the prefilled current branch can be kept (normal commit) or changed (commit lands on a newly-created branch). Empty branch name disables "Commit" and shows a red border; a detached HEAD (no current branch) therefore requires the user to name a branch before committing.

This fulfills EPIC-031's deferred acceptance item *"Create-a-branch from the Commit dialog"*.

## Background

### How branch creation works in git (design basis)

A branch is just a movable pointer to **one commit** (`.git/refs/heads/<name>` holding a hash). Creating a branch only needs a commit to point at — no "parent branch". Start point can be a branch/tag/remote-ref/raw hash, or default `HEAD`. The only impossible case is an empty repo (zero commits). Name must pass `git check-ref-format` (no spaces, `~^:?*[\`, no `..`, no leading/trailing `/`, etc.) and must not collide with an existing branch — `git branch <existing>` **fails** (`fatal: a branch named '…' already exists`); we never use `-f`.

Two git forms we use:
- `git branch <name> [<start>]` — **create only** (HEAD unmoved).
- `git switch -c <name> [<start>]` — **create + checkout**. Crucially, this **carries the staged index and working-tree changes** to the new branch (no conflict when branching at the same commit), so a subsequent `git commit` lands on the new branch.

### Existing infrastructure to build on

**Git IPC chain (5-touch pattern — mirror `gitSwitch`, US-636):**

| File | Existing `gitSwitch` reference |
|------|--------------------------------|
| `src/main/git-service.ts` | `switchTo(dir, target)` → `GitMutationResult` (never throws) — lines 445–474 |
| `src/ipc/api-types.ts` | `Endpoint.gitSwitch` enum + signature `[Endpoint.gitSwitch]: (dir, target) => Promise<GitMutationResult>` — lines 75, 150 |
| `src/ipc/main/controller.ts` | `gitSwitch` handler (lazy `import("../../main/git-service")`) + `bindEndpoint(Endpoint.gitSwitch, …)` — lines 309–311, 390 |
| `src/ipc/renderer/api.ts` | `gitSwitch = async (dir, target) => executeOnce<GitMutationResult>(Endpoint.gitSwitch, dir, target)` — lines 298–300 |
| `src/renderer/api/git.ts` | `switchTo(repoRoot, target)` wrapper, gated on `git.enabled`, `.catch → {ok:false}` — lines 171–174 |

`GitMutationResult { ok: boolean; error?: string }` (`src/ipc/git-ipc.ts:62`) is reused — **no new DTO needed** (string args in, mutation result out).

**Commit dialog** (`src/renderer/ui/dialogs/CommitDialog.tsx`):
- `CommitDialogProps` has `branch?: string` rendered **read-only** as `<Text>` (lines 92–95).
- `canCommit = !!state.message?.trim()` gates the action buttons (line 80, 135).
- `submit()` guards on non-blank message (lines 66–75); `CommitResult` returns `{ message, name, email, button }`.
- Opened by `GitChangesSecondaryView.doCommit` (lines 110–116): fetches identity, `showCommitDialog({ branch, name, email })`, then `model.changes.commit(result.message, {name,email})`.

**Commit model** (`src/renderer/components/git-tree/GitChangesModel.ts`):
- `commit(message, identity?)` → `git.commit(...)`, toasts on failure, `reload()`, returns `boolean` (lines 151–157).

**Grid context menu** (`src/renderer/editors/git-tree/GitTreeEditorView.tsx`):
- `commitContextMenu(rows: GitCommitRow[])` builds the "Switch to …" items; `row.hash` / `row.shortHash` available; `multi = rows.length > 1` (lines 77–110). Wired via `<GitTree getContextMenuItems={commitContextMenu}>`.

**Name-input dialog** (`src/renderer/ui/dialogs/InputDialog.tsx`):
- `showInputDialog({ title, message, value, buttons, … })` → `Promise<InputResult | undefined>` where `InputResult = { value, button, selectedOption? }`. Enter submits the default button; supports optional `options` radios. Reused as-is.

**Model `switchTo` pattern** (`GitTreeEditorModel.ts:208–214`): get `repoRoot`, call git op, toast on `!ok`, `this.refresh()`. New `createBranchAt` mirrors this.

**UIKit `Input`** (`src/renderer/uikit/Input/Input.tsx`): no error/invalid state today. `color.error.border` token exists (`color.ts:59`). Needs a small additive `invalid?: boolean` prop → `data-invalid` → red border.

## Implementation plan

### Step 1 — Backend: `createBranch` in `git-service.ts`

Add after `switchTo` (end of file):

```ts
/**
 * Create a branch (EPIC-031 / US-638). `startPoint` is a commit hash / ref;
 * omitted → current HEAD. `checkout` true uses `git switch -c` (create + check
 * out, carrying the staged index so a following commit lands on the new branch);
 * false uses `git branch` (create only, HEAD unmoved). An invalid or already-
 * existing name makes git exit non-zero → returned as `{ ok:false, error }` for
 * the renderer to toast (we never pass `-f`). Never throws.
 */
export async function createBranch(
    dir: string,
    name: string,
    startPoint?: string,
    checkout = false,
): Promise<GitMutationResult> {
    if (!name.trim()) return { ok: false, error: "Empty branch name" };
    try {
        const git = simpleGit(dir);
        const args = checkout
            ? ["switch", "-c", name, ...(startPoint ? [startPoint] : [])]
            : ["branch", name, ...(startPoint ? [startPoint] : [])];
        await git.raw(args);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}
```

### Step 2 — IPC wiring (mirror `gitSwitch` in all 4 files)

- **`src/ipc/api-types.ts`**: add `gitCreateBranch = "gitCreateBranch"` to `Endpoint`; add signature
  `[Endpoint.gitCreateBranch]: (dir: string, name: string, startPoint?: string, checkout?: boolean) => Promise<GitMutationResult>;`
- **`src/ipc/main/controller.ts`**: add handler
  ```ts
  gitCreateBranch = async (_event: IpcMainEvent, dir: string, name: string, startPoint?: string, checkout?: boolean) => {
      const { createBranch } = await import("../../main/git-service");
      return createBranch(dir, name, startPoint, checkout);
  };
  ```
  and `bindEndpoint(Endpoint.gitCreateBranch, controllerInstance.gitCreateBranch);`
- **`src/ipc/renderer/api.ts`**: add
  ```ts
  gitCreateBranch = async (dir: string, name: string, startPoint?: string, checkout?: boolean) => {
      return executeOnce<GitMutationResult>(Endpoint.gitCreateBranch, dir, name, startPoint, checkout);
  };
  ```
- **`src/renderer/api/git.ts`**: add
  ```ts
  createBranch(repoRoot: string, name: string, startPoint?: string, checkout?: boolean): Promise<GitMutationResult> {
      if (!settings.get("git.enabled") || !repoRoot || !name.trim()) return Promise.resolve({ ok: true });
      return api.gitCreateBranch(repoRoot, name, startPoint, checkout).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
  }
  ```

### Step 3 — Option 1: grid "Create branch here"

**`GitTreeEditorModel.ts`** — add method (mirrors `switchTo`):

```ts
/** Create a branch at a commit and check it out, prompting for the name
 *  (US-638). Reuses the name-input dialog; an invalid/duplicate name (or a dirty
 *  tree that would be overwritten when checking out a historical commit) is
 *  surfaced as a toast. Uses `switch -c` (checkout=true) so the new branch
 *  becomes current — mirrors the commit-dialog flow. Refreshes on success so the
 *  new (now-current) ref appears in the graph + Branches panel. */
createBranchAt = async (hash: string, shortHash: string): Promise<void> => {
    const repoRoot = this.state.get().repoRoot;
    if (!repoRoot) return;
    const { showInputDialog } = await import("../../ui/dialogs/InputDialog");
    const res = await showInputDialog({
        title: "Create branch",
        message: `Create branch at ${shortHash}`,
        value: "",
        buttons: ["Create", "Cancel"],
    });
    if (res?.button !== "Create" || !res.value.trim()) return;
    const r = await git.createBranch(repoRoot, res.value.trim(), hash, true);
    if (!r.ok) void ui.notify(`Failed to create branch: ${r.error ?? "unknown error"}`, "error");
    this.refresh();
};
```

**`GitTreeEditorView.tsx`** — in `commitContextMenu`, append before `return items;`:

```ts
items.push({
    label: "Create branch here…",
    icon: <GitIcon />,
    startGroup: items.length > 0,
    disabled: multi,
    onClick: () => void model.createBranchAt(row.hash, row.shortHash),
});
```

(`GitIcon` already imported.)

### Step 4 — UIKit `Input`: `invalid` prop

**`src/renderer/uikit/Input/Input.tsx`**:
- Add `invalid?: boolean` to `InputProps` (doc-commented).
- Destructure `invalid` before `...rest`; set `data-invalid={invalid || undefined}` on `Wrapper`.
- In the `Wrapper` styled block add:
  ```ts
  "&[data-invalid]":              { borderColor: color.error.border },
  "&[data-invalid]:focus-within": { borderColor: color.error.border },
  ```
  (keeps the red border even on focus, overriding `border.active`.)

### Step 5 — Option 2: Commit dialog editable + required branch + stay-open-on-failure

The dialog must **drive the commit itself** and stay open if it fails (so the
user fixes an invalid/duplicate branch name and retries without losing the typed
message), closing only after a successful commit. This uses the existing
`TDialogModel.canClose` hook: when it resolves `false`, `onClose` doesn't fire and
the dialog stays mounted (`model.ts:61–77`, `Dialogs.tsx:30–38`).

**Design note (decided 2026-06-12):** the dialog *owns the action lifecycle*
(invoke → stay-open-on-failure → close-on-success, buttons disabled in flight),
but stays **git-agnostic** — the actual `git.createBranch` + `git.commit` calls
remain in `GitChangesModel` and are **injected** into the dialog as the `onAction`
callback. This keeps `CommitDialog` a reusable `ui/dialogs/` primitive with no
`git`/`repoRoot` import, rather than coupling it to the git API.

**`CommitDialog.tsx`**:
- `CommitResult` gains `branch: string`.
- `CommitDialogProps` gains:
  ```ts
  /** Performs a non-Cancel button's action (commit, possibly creating a branch
   *  first). Returns true → the dialog closes; false → it stays open (e.g.
   *  branch creation failed) so the user can fix the branch name / message and
   *  retry. Toasts are raised inside the callback. Omitted → the dialog closes
   *  and resolves the CommitResult (caller-performs-action legacy path). */
  onAction?: (result: CommitResult) => Promise<boolean>;
  ```
- `CommitDialogState` gains a transient `committing?: boolean` flag.
- Add `setBranch = (v) => this.state.update(s => { s.branch = v; })`.
- Store the callback on the model instance (not in render-state):
  `onAction?: (r: CommitResult) => Promise<boolean>;` set by `showCommitDialog`.
- `canClose` runs the action and gates close:
  ```ts
  canClose = async (r?: CommitResult): Promise<boolean> => {
      if (!r) return true;            // Cancel / X / Esc — always close
      if (!this.onAction) return true; // legacy caller-performs path
      return await this.onAction(r);   // false → stay open
  };
  ```
- `submit(button)` guards on message **and** branch, sets `committing` while the
  async close runs, and re-enables on a stay-open (false) result:
  ```ts
  submit = async (button: string) => {
      const s = this.state.get();
      if (s.committing || !s.message?.trim() || !s.branch?.trim()) return;
      this.state.update((d) => { d.committing = true; });
      const closed = await this.close({
          message: s.message ?? "", name: s.name ?? "", email: s.email ?? "",
          branch: s.branch ?? "", button,
      });
      if (!closed) this.state.update((d) => { d.committing = false; }); // stayed open → retry
      // closed === true → dialog unmounts
  };
  ```
- View: replace the read-only branch `<Text>` with an editable required `<Input>`:
  ```tsx
  <Panel direction="row" gap="sm" align="center">
      <Text color="light" nowrap>Branch:</Text>
      <Panel flex={1}>
          <Input
              name="commit-branch"
              value={state.branch ?? ""}
              onChange={model.setBranch}
              invalid={!state.branch?.trim()}
              placeholder="Branch name"
          />
      </Panel>
  </Panel>
  ```
- `canCommit = !!state.message?.trim() && !!state.branch?.trim();`
- Action buttons: `disabled={!canCommit || !!state.committing}` (Cancel stays enabled).
- **Dynamic action label (2026-06-12):** the dialog remembers the current branch at open
  as `originalBranch` (set by `showCommitDialog` from `branch`). When the edited branch
  differs from it (or HEAD was detached → no original), the "Commit" button shows
  **"Create Branch & Commit"**. Only the visible text changes — the button's action
  identity stays `"Commit"` so `onAction`'s `result.button` check is unaffected.
- `showCommitDialog(props)` destructures `onAction` off the props, builds the model
  state from the rest, then assigns `model.onAction = onAction` before `showDialog`.

**`GitChangesSecondaryView.tsx` `doCommit`** — pass the action into the dialog
(the dialog now drives it, staying open on failure):

```ts
const doCommit = useCallback(async () => {
    const id = await model.changes.getIdentity();
    await showCommitDialog({
        branch,
        name: id.name,
        email: id.email,
        onAction: async (result) => {
            if (result.button !== "Commit") return false;
            // Branch edited (or HEAD detached → no current branch) ⇒ create + commit on it.
            const newBranch = result.branch.trim() !== (branch ?? "") ? result.branch.trim() : undefined;
            return model.changes.commit(result.message, { name: result.name, email: result.email }, newBranch);
        },
    });
}, [model, branch]);
```

`model.changes.commit` already returns `boolean` (true ⇒ close, false ⇒ stay open;
the toast is raised inside it).

**`GitChangesModel.commit`** — add optional `newBranch`:

```ts
commit = async (message: string, identity?: GitIdentity, newBranch?: string): Promise<boolean> => {
    if (!this.repoRoot || !message.trim()) return false;
    if (newBranch) {
        // create + checkout first so the commit lands on the new branch
        // (switch -c carries the staged index). Abort the commit if it fails.
        const cr = await git.createBranch(this.repoRoot, newBranch, undefined, true);
        if (!cr.ok) {
            void ui.notify(`Failed to create branch: ${cr.error ?? "unknown error"}`, "error");
            await this.reload();
            return false;
        }
    }
    const r = await git.commit(this.repoRoot, message, identity);
    if (!r.ok) void ui.notify(`Failed to commit: ${r.error ?? "unknown error"}`, "error");
    await this.reload();
    return r.ok;
};
```

### Step 6 — Verify

`npx tsc --noEmit` and `npm run lint` (run separately) clean. Manual: create-branch-here on a commit; commit keeping the branch; commit changing the branch (new branch created + commit on it); detached HEAD commit forces a branch name; invalid/duplicate name toasts.

## Concerns / open questions

1. **Grid "Create branch here" — checkout or not?** ✅ **Resolved (2026-06-12): check out** (`git switch -c`, checkout=true) — the new branch becomes current, mirroring the commit-dialog flow. Note: creating at a *historical* commit moves the working tree to it; a dirty tree git would overwrite makes the switch fail → toast (graceful, same as US-636 switch).

2. **Commit dialog — editing to an *existing* branch name.** ✅ **Resolved (2026-06-12).** Editing the name always means *create a new branch* (`switch -c`). If the typed name already exists or is invalid, git errors → toast, commit aborted, and the **dialog stays open** (via `canClose` returning false) so the user fixes the branch name and clicks Commit again without retyping. We deliberately do **not** support "commit onto a different existing branch" (that would be `switch` without `-c`, a history move). The field's contract is "keep current, or name a new branch".

3. **Required branch changes detached-HEAD commit behavior.** ✅ **Resolved (2026-06-12): keep required.** Today a detached HEAD can commit with no branch, producing a **dangling commit** reachable only via HEAD that becomes unreferenced (and eventually GC'd) the moment the user switches away — git itself warns "create a branch to keep it." After this change the branch field is required, so a detached-HEAD commit forces naming a branch: `switch -c <name>` creates a branch *at the detached commit*, then the commit lands on it (kept). This removes a footgun rather than a useful capability.

4. **`invalid` prop on UIKit `Input`.** ✅ **Resolved (2026-06-12): approved.** Small additive primitive change (one prop, one `data-invalid` selector, existing `color.error.border`), consumed immediately by the Commit dialog. No separate retrofit needed.

5. **Scope: grid only for Option 1.** ✅ **Resolved (2026-06-12): grid only.** The "Branches & Tags" panel could also offer "Create branch from '<branch>'", but the user asked only for the commit grid. Left as a possible future tweak (US-625 rolling log), not in this task.

## Acceptance criteria

- [ ] Right-clicking a single commit row in the Git Tree grid shows **"Create branch here…"**; picking it prompts for a name, creates a branch at that commit **and checks it out** (becomes the current branch — head-green in the graph + Branches panel after refresh). Multi-row selection disables the item.
- [ ] An invalid or duplicate branch name (either flow) shows an error toast and creates nothing. In the Commit dialog the failure **keeps the dialog open** with the typed message + branch intact so the user fixes the name and retries; the dialog closes only after a successful commit.
- [ ] Commit dialog shows the current branch in an **editable** field; keeping it commits to the current branch as before.
- [ ] Changing the branch name commits onto a **newly created** branch (created + checked out, staged changes carried).
- [ ] Empty branch name disables "Commit" and shows a **red border**; a detached HEAD opens with an empty branch field that must be filled to commit.
- [ ] The action button reads **"Commit"** when the branch is unchanged and **"Create Branch & Commit"** when the branch name is edited (or HEAD is detached).
- [ ] `tsc --noEmit` and `lint` clean; all git behavior stays behind the off-by-default "Git integration" setting.

## Files changed

| File | Change |
|------|--------|
| `src/main/git-service.ts` | **+** `createBranch(dir, name, startPoint?, checkout?)` |
| `src/ipc/api-types.ts` | **+** `Endpoint.gitCreateBranch` + signature |
| `src/ipc/main/controller.ts` | **+** `gitCreateBranch` handler + `bindEndpoint` |
| `src/ipc/renderer/api.ts` | **+** `gitCreateBranch` client method |
| `src/renderer/api/git.ts` | **+** `createBranch` wrapper (git.enabled-gated) |
| `src/renderer/editors/git-tree/GitTreeEditorModel.ts` | **+** `createBranchAt(hash, shortHash)` |
| `src/renderer/editors/git-tree/GitTreeEditorView.tsx` | **+** "Create branch here…" context-menu item |
| `src/renderer/uikit/Input/Input.tsx` | **+** `invalid?: boolean` prop (`data-invalid` → red border) |
| `src/renderer/ui/dialogs/CommitDialog.tsx` | branch read-only `Text` → required editable `Input`; `CommitResult.branch`; `canCommit`/`submit` include branch; **+** `onAction` callback + `canClose` (stay open on failure, close on success) + `committing` in-flight flag |
| `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` | `doCommit` passes an `onAction` that computes `newBranch` and calls `commit` (dialog drives + stays open on failure) |
| `src/renderer/components/git-tree/GitChangesModel.ts` | `commit(message, identity?, newBranch?)` — create+checkout before commit |

## Files that need NO change

- `src/ipc/git-ipc.ts` — `GitMutationResult` reused; no new DTO.
- `src/renderer/components/git-tree/GitBranchesModel.ts` / `GitBranchesSecondaryView.tsx` — refresh after create repopulates refs automatically; no direct edits.
- `src/renderer/components/git-tree/GitTreeModel.ts` — `refresh()` reloads the log; the new ref decoration comes for free.
- `assets/editor-types/**` — build artifact (regenerated from `src/renderer/api/types/`); never hand-edited (the new git API isn't in the scripting `.d.ts` surface anyway).
