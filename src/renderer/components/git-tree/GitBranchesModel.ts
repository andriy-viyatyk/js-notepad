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
import { ui } from "../../api/ui";
import type { GitRefs, GitAheadBehind, GitPullOptions } from "../../../ipc/git-ipc";

export interface GitBranchesState {
    /** Repository refs (branches / remotes / tags / current). */
    refs: GitRefs;
    /** A refs fetch is in flight. */
    loading: boolean;
    /** Probe result — `false` → git unavailable; tree renders empty. */
    gitOk: boolean;
    /** Ahead/behind counts for the current branch vs its upstream. */
    aheadBehind: GitAheadBehind;
    /** A push is in flight (drives the Push button busy state). */
    pushing: boolean;
    /** A fetch is in flight (drives the Fetch button busy state). */
    fetching: boolean;
    /** A pull is in flight (drives the Pull button busy state). */
    pulling: boolean;
}

const EMPTY_REFS: GitRefs = { localBranches: [], remotes: [], remoteBranches: [], tags: [] };

const defaultGitBranchesState: GitBranchesState = {
    refs: EMPTY_REFS,
    loading: false,
    gitOk: true,
    aheadBehind: { ahead: 0, behind: 0, hasUpstream: false },
    pushing: false,
    fetching: false,
    pulling: false,
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
    };

    /** Fetch all remotes, then reload refs + ahead/behind (US-641).
     *  Sets `fetching` for the duration; toasts on failure. Never throws. The
     *  `finally` guarantees the busy flag clears even if `reload()` throws, so the
     *  toolbar button can't get stuck disabled. */
    fetch = async (): Promise<void> => {
        if (!this.repoRoot) return;
        this.write((s) => { s.fetching = true; });
        try {
            const r = await git.fetch(this.repoRoot);
            if (!r.ok) void ui.notify(`Failed to fetch: ${r.error ?? "unknown error"}`, "error");
            await this.reload();
        } finally {
            this.write((s) => { s.fetching = false; });
        }
    };

    /** Push the current branch to its upstream (US-641). When there is no upstream,
     *  passes `setUpstream:true` to create one (`-u origin <branch>`). Sets `pushing`
     *  for the duration; toasts on failure or rejection. Reloads afterward. Never throws.
     *  The `finally` guarantees the busy flag clears even if `reload()` throws. */
    push = async (): Promise<void> => {
        if (!this.repoRoot) return;
        const ab = this.state.get().aheadBehind;
        // Hint the service to set upstream when the cached state shows none. The
        // service ALSO probes the upstream fresh at push time, so a just-created
        // branch whose cached ahead/behind is still stale is still handled — this
        // hint is belt-and-suspenders, not the source of truth.
        const setUpstream = !ab.hasUpstream;
        this.write((s) => { s.pushing = true; });
        try {
            const r = await git.push(this.repoRoot, { setUpstream });
            if (!r.ok) {
                const msg = r.rejected
                    ? "Push rejected: fetch or pull first, then push again."
                    : `Failed to push: ${r.error ?? "unknown error"}`;
                void ui.notify(msg, "error");
            }
            await this.reload();
        } finally {
            this.write((s) => { s.pushing = false; });
        }
    };

    /** Pull from the current branch's upstream (US-642). Merge by default; rebase when
     *  `opts.rebase`. On success reloads refs + ahead/behind; on conflict toasts the list
     *  of conflicted files (the Changes panel then shows them with status 'U'); on other
     *  failure (no upstream, HTTPS auth, dirty tree) toasts the git error. Never throws.
     *  The `finally` guarantees the busy flag clears even if `reload()` throws. */
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

    /** Cheap ahead/behind-only reload (US-641) — used by the editor toolbar's refresh
     *  when the tree is visible but the Branches panel is collapsed (so the full refs
     *  reload is skipped). Skips while a fetch/push/pull is in flight (that flow reloads on
     *  its own — avoids a racing write that flickers the count badge). Never throws. */
    reloadAheadBehind = async (): Promise<void> => {
        if (!this.repoRoot) return;
        const s0 = this.state.get();
        if (s0.fetching || s0.pushing || s0.pulling) return;
        const ab = await git.aheadBehind(this.repoRoot);
        if (this.disposed) return;
        this.write((s) => { s.aheadBehind = ab; });
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
