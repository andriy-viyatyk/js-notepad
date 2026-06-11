/**
 * Git branches/tags data model (EPIC-031 / US-634).
 *
 * Focused submodel of the Git Tree editor (model-view) — the sibling of
 * `GitTreeModel` and `GitChangesModel`. Holds the repository refs (local
 * branches, remotes + remote-tracking branches, tags, current branch) for the
 * "Branches & Tags" secondary-view panel. The panel is a pure renderer over
 * `state`; all fetching lives here. Owned + disposed by the owning editor
 * (`GitTreeEditorModel`), which composes focused submodels the same way
 * `BrowserEditor` does (webview / urlBar / bookmarksUI / target).
 *
 * Gated by the "git.enabled" setting via the renderer git API — when off, no
 * git activity happens at all.
 */
import { TComponentState } from "../../core/state/state";
import { settings } from "../../api/settings";
import { git } from "../../api/git";
import type { GitRefs } from "../../../ipc/git-ipc";

export interface GitBranchesState {
    /** Repository refs (branches / remotes / tags / current). */
    refs: GitRefs;
    /** A refs fetch is in flight. */
    loading: boolean;
    /** Probe result — `false` → git unavailable; tree renders empty. */
    gitOk: boolean;
}

const EMPTY_REFS: GitRefs = { localBranches: [], remotes: [], remoteBranches: [], tags: [] };

const defaultGitBranchesState: GitBranchesState = {
    refs: EMPTY_REFS,
    loading: false,
    gitOk: true,
};

export class GitBranchesModel {
    readonly state = new TComponentState<GitBranchesState>({ ...defaultGitBranchesState });

    private repoRoot: string | undefined;
    private disposed = false;

    /** Set true by `markStale()` when a repo change happened while this panel was
     *  hidden; cleared by the next `reload()`. The owning editor reloads on reveal
     *  only when stale (visibility-aware refresh, US-634). */
    private _stale = false;
    get stale(): boolean {
        return this._stale;
    }
    /** Mark the refs possibly out-of-date without fetching (the panel is collapsed). */
    markStale(): void {
        this._stale = true;
    }

    /** Point the model at a repo. Resets the refs when the target changes. */
    configure(repoRoot: string | undefined): void {
        if (this.repoRoot === repoRoot) return;
        this.repoRoot = repoRoot;
        this._stale = false;
        this.write((s) => {
            s.refs = EMPTY_REFS;
            s.loading = false;
        });
    }

    /** Reload the refs (probe + for-each-ref). Always re-fetches. */
    reload = async (): Promise<void> => {
        this._stale = false;
        const gitEnabled = settings.get("git.enabled");
        if (!gitEnabled || !this.repoRoot) {
            this.write((s) => {
                s.gitOk = gitEnabled;
                s.refs = EMPTY_REFS;
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
                s.refs = EMPTY_REFS;
                s.loading = false;
            });
            return;
        }
        const refs = await git.refs(this.repoRoot);
        if (this.disposed) return;
        this.write((s) => {
            s.gitOk = true;
            s.refs = refs;
            s.loading = false;
        });
    };

    dispose(): void {
        this.disposed = true;
    }

    /** State write guarded against late async writes after dispose. */
    private write(fn: (s: GitBranchesState) => void): void {
        if (this.disposed) return;
        this.state.update(fn);
    }
}
