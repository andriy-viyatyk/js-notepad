# US-632: Git "Changes" panel — Commit staged files (commit dialog)

**Epic:** [EPIC-031 — Git Functionality Enhancements (incremental)](../../epics/EPIC-031.md)
**Status:** ✅ Done (2026-06-11) — reviewed, documented (dev + user), tested.

## Goal

Add a **"Commit" button under the Staged file grid** in the Git Tree "Changes" panel
that opens a **Commit dialog** (modeled on `showConfirmationDialog`): a multi-line
message field, the current branch name, and **editable author Name/Email fields
prepopulated from git config**, with a "Commit" button that runs a real `git commit` of
the staged index. This is the **second class of mutating git op** in the app (after
stage/unstage/reset in US-631).

### Author identity (decided 2026-06-10 — "per-commit only")
The dialog shows two editable fields — **Name** and **Email** — prepopulated from the
effective git config (`git config user.name` / `git config user.email`, the layered
system→global→local resolution; normally already filled from `~/.gitconfig`). The commit
**always** uses exactly what the dialog shows, applied as a **per-commit override** via
simple-git's `config` option (`-c user.name=… -c user.email=…`). **No config file is ever
written** — edits never clobber the user's global identity, and we never silently mutate
config. (Trade-off accepted: if git has no identity configured at all, the user re-enters
it each commit — rare, since identity is normally set globally once. Persisting to config
is a possible future enhancement.)

## Scope decisions (recommendation — confirm in review)

The user raised two optional extensions. **Recommendation: postpone both**, keeping this
task tightly scoped to "commit the staged files". Both are purely additive later.

| Extension | Recommendation | Why |
|-----------|----------------|-----|
| **Create-a-branch** in the dialog | **Postpone** to a dedicated branch-management task | Branch create/switch/merge is its own feature area (north-star goal). The commit dialog only *displays* the current branch here. |
| **"Commit and Push"** button | **Postpone** to a dedicated push task | Push carries real complexity: remote auth (HTTPS creds / SSH), no-upstream (`--set-upstream`), push progress, and rejection (non-fast-forward) handling. Ship a clean local commit first. |

The dialog is designed so the push task is **additive**: `showCommitDialog` takes a
`buttons?` array (default `["Commit", "Cancel"]`); the push task just passes
`["Commit", "Commit and Push", "Cancel"]` and handles the extra return value — no dialog
rework. (If you'd rather include "Commit and Push" now, say so and I'll fold the push
endpoint into this task.)

## Background — existing code to build on

### Mutating-git infrastructure (US-631 — the template to mirror)
The commit op follows the exact same trip as stage/unstage/reset:

1. **Backend** `src/main/git-service.ts` — `stage()`/`unstage()`/`discard()` each return
   `GitMutationResult` (`{ ok, error? }`) and never throw. `commit()` slots in next to them.
   `simpleGit(dir).commit(message)` commits **only the staged index** (no `-a`), which is
   exactly the desired behavior.
2. **DTO** `src/ipc/git-ipc.ts` — `GitMutationResult` already exists (reuse it).
3. **IPC trio:**
   - `src/ipc/api-types.ts` — `Endpoint.gitStage/gitUnstage/gitDiscard` enum entries +
     `Api` signatures. Add `gitCommit`.
   - `src/ipc/main/controller.ts` — `gitStage` handler (lazy `import("../../main/git-service")`)
     + `bindEndpoint(Endpoint.gitStage, …)`. Add `gitCommit` likewise.
   - `src/ipc/renderer/api.ts` — `gitStage = async (dir, paths) => executeOnce<GitMutationResult>(…)`.
     Add `gitCommit`.
4. **Gated renderer wrapper** `src/renderer/api/git.ts` — `stage()/unstage()/discard()` check
   `settings.get("git.enabled")`, no-op when off, `.catch → { ok:false, error }`. Add `commit()`.
5. **Submodel** `src/renderer/components/git-tree/GitChangesModel.ts` — `stagePaths`/
   `unstagePaths`/`resetChanges` call the wrapper, toast on `!ok` via `ui.notify(msg, "error")`,
   then `reload()`. Add `commit()` the same way.

> **Main-process HMR caveat (carried from US-631):** a NEW main-process IPC handler
> (`gitCommit`) requires a **full app restart** to bind — Vite HMR only reloads the renderer,
> so `executeOnce` hangs against an unbound handler until the app is restarted.

### Dialogs — the pattern for the Commit dialog
- `src/renderer/ui/dialogs/ConfirmationDialog.tsx` — closest model: `showConfirmationDialog({title, message, buttons})` → `Promise<string>` (clicked button label). Uses `TDialogModel` + `showDialog` + `Views.registerView`.
- `src/renderer/ui/dialogs/InputDialog.tsx` — shows the pattern for a dialog that **carries an editable value in state** and gates Enter/the default button on `value.trim()`. The Commit dialog mirrors this for its message field.
- `src/renderer/ui/dialogs/TextDialog.tsx` — shows a returned `{ text, button }` result shape.
- **Editors importing `showConfirmationDialog` from `ui/dialogs/` is accepted precedent** (recorded in `coding-style.md`; used by `GraphBody.tsx`, `ScriptPanel.tsx`, `GitChangesSecondaryView.tsx`). The Commit button handler will call `showCommitDialog` the same way.

### UIKit primitives for the dialog
- `Textarea` (`src/renderer/uikit/Textarea/Textarea.tsx`) — string-value API: `value`, `onChange:(v)=>void`, `placeholder`, `minHeight`, `maxHeight`, `autoFocus`, `onKeyDown` (runs before internal handler; `preventDefault` to own the event — used for the Ctrl+Enter submit). Multi-line by default (`singleLine` off).
- `Dialog`, `DialogContent`, `Panel`, `Text`, `Button` — from `../../uikit`.
- `RefBadge` (`src/renderer/components/git-tree/RefBadge.tsx`) — existing branch/tag chip; optional, for rendering the branch name as a chip rather than plain text.

### Current branch — how to surface it
`git-service.status()` runs simple-git's `status()`, whose result already includes
`.current` (branch), `.tracking`, `.ahead`, `.behind` — currently unused. The "Changes"
panel reloads status constantly, so the cheapest path is to **carry the branch in the
status result** rather than add a separate round-trip:
- `GitStatusResult` (`git-ipc.ts`) gains `branch?: string`.
- `git-service.status()` maps `branch: s.current ?? undefined`.
- `GitChangesState` (`GitChangesModel.ts`) gains `branch?: string`; `reload()` stores it.
- The Commit button handler reads `model.changes.state.get().branch` and passes it to `showCommitDialog`.

(Ahead/behind are intentionally left for the push task — they only matter once push exists.)

### Author identity — reading & overriding
- **Read (prepopulate):** `git config user.name` / `git config user.email` resolve the
  effective identity (`simpleGit(dir).raw(["config", key])` → trimmed value; throws when
  unset → catch → `""`). This is what Git Extensions reads — the user never types it because
  it's in their global `~/.gitconfig`.
- **Override (commit):** simple-git accepts a per-command config array —
  `simpleGit(dir, { config: ["user.name=…", "user.email=…"] }).commit(msg)` is equivalent to
  `git -c user.name=… -c user.email=… commit`. Applies the shown identity to **this commit
  only**; writes no config file.

### Where the button goes
`src/renderer/editors/git-tree/GitChangesSecondaryView.tsx` — the Staged list is the bottom
splitter panel. `ChangesList` already renders an optional `toolbarRight` (the ↓/↑ arrow
buttons) above the `FileGrid`. Add an optional **`footer`** slot rendered **below** the
`FileGrid`, and pass a "Commit" button into the Staged list's footer (user asked for it
"under the Staged file grid").

## Implementation plan

### 1. Backend — `src/main/git-service.ts`
Add after `discard()`:
```ts
/**
 * Effective git author identity (EPIC-031 / US-632) — `git config user.name` /
 * `user.email`, the layered system→global→local resolution. Used to PREPOPULATE the
 * commit dialog (what Git Extensions reads — the user never types it because it's in
 * `~/.gitconfig`). Each key throws when unset → "" (no identity configured). Never throws.
 */
export async function getIdentity(dir: string): Promise<GitIdentity> {
    const read = async (key: string): Promise<string> => {
        try { return (await simpleGit(dir).raw(["config", key])).trim(); }
        catch { return ""; } // key unset (or git unavailable) → empty
    };
    return { name: await read("user.name"), email: await read("user.email") };
}

/**
 * Commit the staged index with `message` (EPIC-031 / US-632). `simpleGit().commit`
 * commits only what is staged (no `-a`). When `identity` is given, it is applied as a
 * PER-COMMIT override (`-c user.name=… -c user.email=…` via simple-git's `config`
 * option) — no config file is written (decided "per-commit only"). Rejects an
 * empty/whitespace message rather than relying on git (which would need
 * `--allow-empty-message`). Never throws — returns `{ ok:false, error }` so the renderer
 * can toast hook/identity failures (e.g. missing identity, failing pre-commit hook).
 */
export async function commit(
    dir: string,
    message: string,
    identity?: GitIdentity,
): Promise<GitMutationResult> {
    if (!message.trim()) return { ok: false, error: "Empty commit message" };
    try {
        // Only attach the override when at least one field is set, so a blank
        // dialog (git unconfigured + nothing typed) falls through to git's own
        // resolution / error rather than committing as "=".
        const opts = identity && (identity.name || identity.email)
            ? { config: [`user.name=${identity.name}`, `user.email=${identity.email}`] }
            : undefined;
        await simpleGit(dir, opts).commit(message);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: String(e) };
    }
}
```

### 2. DTOs — `src/ipc/git-ipc.ts`
- Add a new DTO:
  ```ts
  /** Git author identity (EPIC-031 / US-632). Empty strings when unset. */
  export interface GitIdentity {
      name: string;
      email: string;
  }
  ```
- Add to `GitStatusResult`:
  ```ts
  /** Current branch name (simple-git status `.current`), or undefined when detached / no commits. */
  branch?: string;
  ```
- `src/main/git-service.ts` `status()` — return `{ staged, unstaged, branch: s.current ?? undefined }`; the `catch` returns `{ staged: [], unstaged: [] }` (branch stays undefined). Import `GitIdentity` alongside the other types.

### 3. IPC trio — `gitCommit` + `gitIdentity`
- `api-types.ts`: import `GitIdentity`; add to `Endpoint` `gitCommit = "gitCommit"`, `gitIdentity = "gitIdentity"`; add to `Api`:
  ```ts
  [Endpoint.gitCommit]:   (dir: string, message: string, identity?: GitIdentity) => Promise<GitMutationResult>;
  [Endpoint.gitIdentity]: (dir: string) => Promise<GitIdentity>;
  ```
- `controller.ts`:
  ```ts
  gitCommit = async (_event: IpcMainEvent, dir: string, message: string, identity?: GitIdentity) => {
      const { commit } = await import("../../main/git-service");
      return commit(dir, message, identity);
  };
  gitIdentity = async (_event: IpcMainEvent, dir: string) => {
      const { getIdentity } = await import("../../main/git-service");
      return getIdentity(dir);
  };
  ```
  + `bindEndpoint(Endpoint.gitCommit, controllerInstance.gitCommit);`
  + `bindEndpoint(Endpoint.gitIdentity, controllerInstance.gitIdentity);`
- `renderer/api.ts`:
  ```ts
  gitCommit = async (dir: string, message: string, identity?: GitIdentity) => {
      return executeOnce<GitMutationResult>(Endpoint.gitCommit, dir, message, identity);
  };
  gitIdentity = async (dir: string) => {
      return executeOnce<GitIdentity>(Endpoint.gitIdentity, dir);
  };
  ```

> **Main-process HMR caveat:** BOTH new handlers (`gitCommit`, `gitIdentity`) need a **full app restart** to bind.

### 4. Gated wrapper — `src/renderer/api/git.ts`
Import `GitIdentity`. Add:
```ts
const EMPTY_IDENTITY: GitIdentity = { name: "", email: "" };

/**
 * Effective git identity for prepopulating the commit dialog (EPIC-031 / US-632).
 * Returns empty strings (no git spawn) when git is off or no root is given. Never throws.
 */
getIdentity(repoRoot: string): Promise<GitIdentity> {
    if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(EMPTY_IDENTITY);
    return api.gitIdentity(repoRoot).catch((): GitIdentity => EMPTY_IDENTITY);
}

/**
 * Commit the staged index (EPIC-031 / US-632). `identity` (from the dialog) is applied
 * as a per-commit override. Returns `{ ok:true }` (no-op) when git is off or no
 * root/message; on IPC failure resolves to `{ ok:false, error }` — never throws.
 */
commit(repoRoot: string, message: string, identity?: GitIdentity): Promise<GitMutationResult> {
    if (!settings.get("git.enabled") || !repoRoot || !message.trim()) return Promise.resolve({ ok: true });
    return api.gitCommit(repoRoot, message, identity).catch((e): GitMutationResult => ({ ok: false, error: String(e) }));
}
```

### 5. Submodel — `src/renderer/components/git-tree/GitChangesModel.ts`
- Add `branch?: string` to `GitChangesState` (default undefined); store `result.branch` in `reload()`.
- Import `GitIdentity`. Add:
  ```ts
  /** Effective git identity for prepopulating the commit dialog (US-632). */
  getIdentity = (): Promise<GitIdentity> => {
      return this.repoRoot ? git.getIdentity(this.repoRoot) : Promise.resolve({ name: "", email: "" });
  };

  /** Commit the staged index with the dialog's identity (US-632). Toasts on failure,
   *  then reloads (clears the staged list; the watcher + reload also refresh the commit
   *  tree). Returns whether it succeeded — the (future) push step keys off this. */
  commit = async (message: string, identity?: GitIdentity): Promise<boolean> => {
      if (!this.repoRoot || !message.trim()) return false;
      const r = await git.commit(this.repoRoot, message, identity);
      if (!r.ok) void ui.notify(`Failed to commit: ${r.error ?? "unknown error"}`, "error");
      await this.reload();
      return r.ok;
  };
  ```

### 6. New dialog — `src/renderer/ui/dialogs/CommitDialog.tsx`
Mirror `InputDialog.tsx` (carries editable values in state; gates the default button on `message.trim()`). Sketch:
- Props: `{ title?: string; branch?: string; message?: string; name?: string; email?: string; buttons?: string[] }` (default title "Commit", buttons `["Commit", "Cancel"]`).
- Result: `{ message: string; name: string; email: string; button: string } | undefined`.
- Model: `CommitDialogModel extends TDialogModel<CommitDialogProps, CommitResult | undefined>` with `setMessage(v)`, `setName(v)`, `setEmail(v)`; `handleKeyDown` → Esc cancels; **Ctrl/Cmd+Enter** closes with the first (default/"Commit") button when `message.trim()` is non-empty.
- View: `DialogContent` (icon `GitIcon` or `ConfirmIcon`) with, top→bottom:
  - **Branch line:** `Text` "Branch:" + the branch (plain `Text`, or a `RefBadge kind="branch"`). Show "(detached / no branch)" when `branch` is undefined.
  - **Author Name** `Input` (prepopulated from `name`).
  - **Author Email** `Input` (prepopulated from `email`).
  - **Message** `Textarea` (autoFocus, `minHeight` ~120, `maxHeight` ~300, placeholder "Commit message", `onKeyDown` wired to the Ctrl+Enter submit).
  - **Button row:** render `buttons`; **disable the first button (`"Commit"`)** when `!message.trim()`; "Cancel" always closes with `undefined`. (Name/Email are NOT required — blank falls through to git's own resolution.)
- `showCommitDialog(props): Promise<CommitResult | undefined>` via `showDialog` + `Views.registerView` (identical wiring to the other dialogs).

> **No Emotion / styled in this file beyond UIKit** — but `ui/dialogs/` is application chrome, so it composes UIKit primitives (`Dialog`, `Panel`, `Input`, `Textarea`, `Button`, `Text`) the same way the sibling dialogs do. No new `styled.*`.

### 7. View — `src/renderer/editors/git-tree/GitChangesSecondaryView.tsx`
- `ChangesList` renders a **single bar above the grid** with a `toolbarLeft` slot
  (the "Commit" button, left-aligned) + `Spacer` + `toolbarRight` slot (the stage/unstage
  arrows, right-aligned). The Staged list passes both; the bar renders only when either is set.
- In `GitChangesBody`, read `branch` from `model.changes.state.use(...)`. Build a `commit` callback that fetches the identity, opens the dialog prepopulated, and commits with the (possibly edited) identity:
  ```ts
  const doCommit = useCallback(async () => {
      const id = await model.changes.getIdentity();
      const result = await showCommitDialog({ branch, name: id.name, email: id.email });
      if (result?.button === "Commit" && result.message.trim()) {
          void model.changes.commit(result.message, { name: result.name, email: result.email });
      }
  }, [model, branch]);
  ```
- Build a `commitButton` (`<Button>` label "Commit", `disabled={!staged.length}`, `onClick={doCommit}`), and pass it as `footer` to the **Staged** `ChangesList` (right-aligned in its footer row, or full-width — match Git-Extensions feel; right-aligned button is fine).

## Concerns / open questions

1. **Push & branch-create scope** — recommended postpone (see table above). **Needs user confirm.**
2. **Empty staged list** — the Commit button is disabled when `staged.length === 0`. A user could still have staged something then unstaged it; the disabled state covers it. (We do not offer "stage all & commit" here — that's a future convenience.)
3. **Empty message** — blocked two ways: the dialog's "Commit" button is disabled until the message is non-blank, and the backend rejects a blank message defensively.
4. **Author identity** — the dialog prepopulates editable Name/Email from effective git
   config and applies whatever is shown as a **per-commit override** (no config write;
   decided "per-commit only"). When git has NO identity AND the user leaves both blank, no
   override is attached and `git commit` fails with git's own "please tell me who you are"
   message → surfaced via `ui.notify(..., "error")`, staged files left intact. (Same
   toast path for a failing pre-commit hook.) Persisting identity to config is a future
   enhancement, not in scope.
5. **Amend / sign-off / verbose** — out of scope. A plain `git commit -m`. Amend (`--amend`) is a natural later increment.
6. **Refresh after commit** — `commit()` calls `reload()`; the US-624 working-tree watcher also fires on the `.git` write, refreshing the commit graph. Double refresh is harmless (the watcher is debounced 500ms and reads-only).
7. **Where the branch comes from** — carried in `GitStatusResult.branch` (no extra round-trip). If we later want ahead/behind in the dialog (for push), extend the same DTO then.

## Acceptance criteria

- [ ] A "Commit" button appears under the Staged file grid; disabled when nothing is staged.
- [ ] Clicking it opens a modal Commit dialog showing the current branch, editable Name/Email fields prepopulated from git config, and a multi-line message field (autofocused).
- [ ] The dialog's "Commit" button is disabled until the message is non-empty; Ctrl+Enter commits; Esc / "Cancel" closes without committing.
- [ ] Committing runs `git commit` of the staged index only, using the dialog's Name/Email as a per-commit override; on success the Staged list clears and the new commit appears in the Git Tree (panel + graph refresh).
- [ ] No git config file is modified by committing (the identity override is per-commit only); the new commit's author matches what the dialog showed.
- [ ] A failed commit (e.g. unset identity, failing hook) shows an error toast and leaves the staged files intact.
- [ ] Everything stays behind the off-by-default "Git integration" setting; git-off / git-missing degrades gracefully (button no-ops, no thrown errors).
- [ ] `npx tsc --noEmit` and `npx eslint` are clean.

## Completion (per EPIC-031 per-task review model)
On "complete the task": run `/review` + `/document` + `/userdoc`, mark `[x]` on the dashboard
and the epic's task table (task stays listed under the epic until the epic closes). Do **not**
move to `completed.md` individually.
