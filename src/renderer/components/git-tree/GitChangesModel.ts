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
import type { GitFileChange } from "../../../ipc/git-ipc";

export interface GitChangesState {
    /** Working-tree (unstaged) changes, incl. untracked. */
    unstaged: GitFileChange[];
    /** Index (staged) changes. */
    staged: GitFileChange[];
    /** A status fetch is in flight. */
    loading: boolean;
    /** Probe result — `false` → git unavailable; lists render empty. */
    gitOk: boolean;
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

    /** Point the model at a repo. Resets the lists when the target changes. */
    configure(repoRoot: string | undefined): void {
        if (this.repoRoot === repoRoot) return;
        this.repoRoot = repoRoot;
        this.write((s) => {
            s.unstaged = [];
            s.staged = [];
            s.loading = false;
        });
    }

    /** Reload the staged/unstaged lists (probe + status). Always re-fetches. */
    reload = async (): Promise<void> => {
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
            s.loading = false;
        });
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
