/**
 * Git Tree data model (EPIC-030 / US-613).
 *
 * Editor-owned model holding the commit list plus the load/pagination state and
 * actions for the `<GitTree>` view (model-view pattern). The component is a pure
 * renderer over `state`; all fetching lives here. Owned + disposed by the
 * owning editor — the Git Tree editor holds one; the File Diff editor holds two
 * (the from/to commit pickers). NOT created via `useComponentModel` (the owner
 * controls its lifecycle, so it survives view remounts / popover open-close).
 *
 * Gated by the "git.enabled" setting via the renderer git API — when off, no
 * git activity happens at all.
 */
import { TComponentState } from "../../core/state/state";
import { settings } from "../../api/settings";
import { git } from "../../api/git";
import type { GitCommit } from "../../../ipc/git-ipc";

/** Commits loaded per page (Concern 7 — manual "load more"). */
export const GIT_TREE_PAGE = 200;

export interface GitTreeState {
    commits: GitCommit[];
    /** First page in flight (initial load / refresh). */
    loading: boolean;
    /** A "load more" / "load all" fetch is in flight. */
    loadingMore: boolean;
    hasMore: boolean;
    /** Probe result — `false` → the owner renders the "git unavailable" body. */
    gitOk: boolean;
}

const defaultGitTreeState: GitTreeState = {
    commits: [],
    loading: false,
    loadingMore: false,
    hasMore: false,
    gitOk: true,
};

export class GitTreeModel {
    readonly state = new TComponentState<GitTreeState>({ ...defaultGitTreeState });

    private repoRoot: string | undefined;
    private file: string | undefined;
    private readonly pageSize: number;
    private loaded = false;
    private disposed = false;

    constructor(opts?: { pageSize?: number }) {
        this.pageSize = opts?.pageSize ?? GIT_TREE_PAGE;
    }

    /**
     * Point the model at a repo (and optional file-scoped history). Resets the
     * list + `loaded` flag when the target changes; a no-op when unchanged.
     */
    configure(repoRoot: string | undefined, file?: string): void {
        if (this.repoRoot === repoRoot && this.file === file) return;
        this.repoRoot = repoRoot;
        this.file = file;
        this.loaded = false;
        this.write((s) => {
            s.commits = [];
            s.hasMore = false;
            s.loading = false;
            s.loadingMore = false;
        });
    }

    /** Reload from page 1 (probe + first page). Always re-fetches (used by Refresh). */
    reload = async (): Promise<void> => {
        const gitEnabled = settings.get("git.enabled");
        if (!gitEnabled || !this.repoRoot) {
            this.loaded = true;
            this.write((s) => {
                s.gitOk = gitEnabled;
                s.commits = [];
                s.hasMore = false;
                s.loading = false;
            });
            return;
        }
        this.write((s) => { s.loading = true; });
        const probe = await git.probe();
        if (this.disposed) return;
        if (!probe.installed) {
            this.loaded = true;
            this.write((s) => {
                s.gitOk = false;
                s.commits = [];
                s.hasMore = false;
                s.loading = false;
            });
            return;
        }
        const list = await git.log(this.repoRoot, { maxCount: this.pageSize, file: this.file });
        if (this.disposed) return;
        this.loaded = true;
        this.write((s) => {
            s.gitOk = true;
            s.commits = list;
            s.hasMore = list.length === this.pageSize;
            s.loading = false;
        });
    };

    /** Append the next page. */
    loadMore = async (): Promise<void> => {
        if (this.state.get().loadingMore || !this.repoRoot) return;
        this.write((s) => { s.loadingMore = true; });
        const list = await git.log(this.repoRoot, {
            maxCount: this.pageSize,
            skip: this.state.get().commits.length,
            file: this.file,
        });
        if (this.disposed) return;
        this.write((s) => {
            s.commits = [...s.commits, ...list];
            s.hasMore = list.length === this.pageSize;
            s.loadingMore = false;
        });
    };

    /**
     * Load the entire history (`maxCount: 0` → no `--max-count`). Re-fetches from
     * HEAD and replaces the list — robust regardless of how much is loaded.
     */
    loadAll = async (): Promise<void> => {
        if (this.state.get().loadingMore || !this.repoRoot) return;
        this.write((s) => { s.loadingMore = true; });
        const list = await git.log(this.repoRoot, { maxCount: 0, file: this.file });
        if (this.disposed) return;
        this.write((s) => {
            s.commits = list;
            s.hasMore = false;
            s.loadingMore = false;
        });
    };

    /** Lazy first load — call on first popover open (File Diff pickers). Idempotent. */
    ensureLoaded = async (): Promise<void> => {
        if (this.loaded) return;
        this.loaded = true;
        await this.reload();
    };

    dispose(): void {
        this.disposed = true;
    }

    /** State write guarded against late async writes after dispose. */
    private write(fn: (s: GitTreeState) => void): void {
        if (this.disposed) return;
        this.state.update(fn);
    }
}
