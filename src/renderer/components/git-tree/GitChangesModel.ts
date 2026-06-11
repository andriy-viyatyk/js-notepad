/**
 * Git changes (status) data model (EPIC-031 / US-616).
 *
 * Focused submodel of the Git Tree editor (model-view) — the sibling of
 * `GitTreeModel`. Holds the working-tree status (staged + unstaged file lists)
 * for the "Changes" secondary-view panel and the load state. The panel is a
 * pure renderer over `state`; all fetching lives here. Owned + disposed by the
 * owning editor (`GitTreeEditorModel`), which composes focused submodels the
 * same way `BrowserEditor` does (webview / urlBar / bookmarksUI / target).
 *
 * Gated by the "git.enabled" setting via the renderer git API — when off, no
 * git activity happens at all.
 */
import { TComponentState } from "../../core/state/state";
import { settings } from "../../api/settings";
import { git } from "../../api/git";
import { ui } from "../../api/ui";
import type { GitFileChange, GitIdentity } from "../../../ipc/git-ipc";

export interface GitChangesState {
    /** Working-tree (unstaged) changes, incl. untracked. */
    unstaged: GitFileChange[];
    /** Index (staged) changes. */
    staged: GitFileChange[];
    /** A status fetch is in flight. */
    loading: boolean;
    /** Probe result — `false` → git unavailable; lists render empty. */
    gitOk: boolean;
    /** Current branch name, or undefined when detached / no commits (US-632). */
    branch?: string;
}

const defaultGitChangesState: GitChangesState = {
    unstaged: [],
    staged: [],
    loading: false,
    gitOk: true,
};

export class GitChangesModel {
    readonly state = new TComponentState<GitChangesState>({ ...defaultGitChangesState });

    private repoRoot: string | undefined;
    private disposed = false;

    /** Set true by `markStale()` when a repo change happened while this panel was
     *  hidden; cleared by the next `reload()`. The owning editor reloads on reveal
     *  only when stale (visibility-aware refresh, US-634). */
    private _stale = false;
    get stale(): boolean {
        return this._stale;
    }
    /** Mark the lists possibly out-of-date without fetching (the panel is collapsed). */
    markStale(): void {
        this._stale = true;
    }

    /** Point the model at a repo. Resets the lists when the target changes. */
    configure(repoRoot: string | undefined): void {
        if (this.repoRoot === repoRoot) return;
        this.repoRoot = repoRoot;
        this._stale = false;
        this.write((s) => {
            s.unstaged = [];
            s.staged = [];
            s.loading = false;
        });
    }

    /** Reload the staged/unstaged lists (probe + status). Always re-fetches. */
    reload = async (): Promise<void> => {
        this._stale = false;
        const gitEnabled = settings.get("git.enabled");
        if (!gitEnabled || !this.repoRoot) {
            this.write((s) => {
                s.gitOk = gitEnabled;
                s.unstaged = [];
                s.staged = [];
                s.loading = false;
            });
            return;
        }
        this.write((s) => { s.loading = true; });
        const probe = await git.probe();
        if (this.disposed) return;
        if (!probe.installed) {
            this.write((s) => {
                s.gitOk = false;
                s.unstaged = [];
                s.staged = [];
                s.loading = false;
            });
            return;
        }
        const result = await git.status(this.repoRoot);
        if (this.disposed) return;
        this.write((s) => {
            s.gitOk = true;
            s.unstaged = result.unstaged;
            s.staged = result.staged;
            s.branch = result.branch;
            s.loading = false;
        });
    };

    /** Stage paths (working-tree → index), then reload the lists (US-631). The
     *  US-624 watcher also fires, but reload now for immediate feedback. On
     *  failure, surface a toast and still reload (shows the true, unchanged
     *  state). `paths` already expanded for renames by the caller (path+oldPath). */
    stagePaths = async (paths: string[]): Promise<void> => {
        if (!this.repoRoot || !paths.length) return;
        const r = await git.stage(this.repoRoot, paths);
        if (!r.ok) void ui.notify(`Failed to stage: ${r.error ?? "unknown error"}`, "error");
        await this.reload();
    };

    /** Unstage paths (index → working-tree), then reload (US-631). Symmetric to
     *  `stagePaths`. */
    unstagePaths = async (paths: string[]): Promise<void> => {
        if (!this.repoRoot || !paths.length) return;
        const r = await git.unstage(this.repoRoot, paths);
        if (!r.ok) void ui.notify(`Failed to unstage: ${r.error ?? "unknown error"}`, "error");
        await this.reload();
    };

    /** Discard working-tree changes for the given Unstaged files — "Reset"
     *  (US-631). Tracked files restore to their staged/HEAD version; untracked
     *  ('?') files are deleted from disk. DESTRUCTIVE — the caller confirms
     *  first. Renames expand to path+oldPath. Toasts on failure, then reloads. */
    resetChanges = async (changes: GitFileChange[]): Promise<void> => {
        if (!this.repoRoot || !changes.length) return;
        const untracked = changes.filter((c) => c.status === "?").map((c) => c.path);
        const tracked = changes
            .filter((c) => c.status !== "?")
            .flatMap((c) => (c.oldPath ? [c.path, c.oldPath] : [c.path]));
        const r = await git.discard(this.repoRoot, tracked, untracked);
        if (!r.ok) void ui.notify(`Failed to reset: ${r.error ?? "unknown error"}`, "error");
        await this.reload();
    };

    /** Effective git author identity (config user.name/email) for prepopulating the
     *  commit dialog (US-632). Empty strings when unset or no repo. */
    getIdentity = (): Promise<GitIdentity> => {
        return this.repoRoot ? git.getIdentity(this.repoRoot) : Promise.resolve({ name: "", email: "" });
    };

    /** Commit the staged index with the dialog's (possibly edited) identity (US-632).
     *  Identity is applied as a per-commit override — no config is written. When
     *  `newBranch` is given (the dialog's branch name was changed, or HEAD was
     *  detached), a branch is created + checked out FIRST via `git switch -c`
     *  (US-638) — which carries the staged index — so the commit lands on the new
     *  branch; a create failure (invalid/duplicate name) toasts and aborts the commit
     *  (returns false → the dialog stays open for a retry). Toasts on failure, then
     *  reloads. Returns whether it succeeded — the future push step keys off this. */
    commit = async (message: string, identity?: GitIdentity, newBranch?: string): Promise<boolean> => {
        if (!this.repoRoot || !message.trim()) return false;
        if (newBranch) {
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

    dispose(): void {
        this.disposed = true;
    }

    /** State write guarded against late async writes after dispose. */
    private write(fn: (s: GitChangesState) => void): void {
        if (this.disposed) return;
        this.state.update(fn);
    }
}
