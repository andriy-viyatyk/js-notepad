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
import type { AVGridModel } from "../../uikit/AVGrid";
import type { GitCommit, GitRef } from "../../../ipc/git-ipc";
import type { GitCommitRow } from "./swimlane-layout";
import type { GitRefNodeKind } from "./git-refs-tree";

/** Commits loaded per page (Concern 7 — manual "load more"). */
export const GIT_TREE_PAGE = 200;

/** Does a commit decoration ref correspond to the clicked panel ref?
 *  The checked-out branch decorates as `head` (not `branch`), so a local-branch
 *  click matches either. Remote branches carry their full "remote/name". */
function refMatches(ref: GitRef, refName: string, kind: GitRefNodeKind): boolean {
    switch (kind) {
        case "branch":
            return (ref.kind === "branch" || ref.kind === "head") && ref.name === refName;
        case "remote-branch":
            return ref.kind === "remote" && ref.name === refName;
        case "tag":
            return ref.kind === "tag" && ref.name === refName;
    }
}

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

    /** Live AVGrid handle, registered by the `<GitTree>` view on mount (US-634).
     *  Present only while the grid is rendered (i.e. the Git Tree is the page's
     *  main editor) — undefined otherwise, in which case `revealRef` no-ops. */
    private grid: AVGridModel<GitCommitRow> | undefined;

    /** Set true by `markStale()` when a repo change happened while the tree was
     *  not the page's main editor; cleared by the next `reload()`. The owning
     *  editor reloads on promote-back only when stale (visibility-aware refresh,
     *  US-634). */
    private _stale = false;
    get stale(): boolean {
        return this._stale;
    }
    /** Mark the commit list possibly out-of-date without fetching (tree not visible). */
    markStale(): void {
        this._stale = true;
    }

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
        this._stale = false;
        this.write((s) => {
            s.commits = [];
            s.hasMore = false;
            s.loading = false;
            s.loadingMore = false;
        });
    }

    /** Reload from page 1 (probe + first page). Always re-fetches (used by Refresh). */
    reload = async (): Promise<void> => {
        this._stale = false;
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
        const list = await git.log(this.repoRoot, { maxCount: this.pageSize, file: this.file, all: !this.file });
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
            all: !this.file,
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
        const list = await git.log(this.repoRoot, { maxCount: 0, file: this.file, all: !this.file });
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

    /** Register (or clear) the live AVGrid handle. The `<GitTree>` view calls
     *  this on mount with `gridRef.current` and on unmount with `undefined`. */
    setGrid(grid: AVGridModel<GitCommitRow> | undefined): void {
        this.grid = grid;
    }

    /**
     * Focus the "Comment" (subject) cell of the commit a ref points to (US-634).
     * Matches the ref against each loaded commit's decoration refs; if found,
     * focuses + scrolls to that row's subject cell. If the ref's tip isn't among
     * the loaded commits (history is paginated), focuses the LAST row instead, so
     * the "Load more" / "Load all" footer is in view. No-op when the grid isn't
     * mounted (Git Tree not the page's main editor).
     */
    revealRef(refName: string, kind: GitRefNodeKind): void {
        const grid = this.grid;
        if (!grid) return;
        const { rows, columns } = grid.data;
        if (!rows.length || !columns.length) return;
        let colIndex = columns.findIndex((c) => String(c.key) === "subject");
        if (colIndex < 0) colIndex = 0;
        const matchIdx = rows.findIndex(
            (r) => r.recordType === "commit" && r.refs.some((ref) => refMatches(ref, refName, kind)),
        );
        const rowIndex = matchIdx >= 0 ? matchIdx : rows.length - 1;
        grid.models.focus.focusCell(rowIndex, colIndex, true);
    }

    dispose(): void {
        this.disposed = true;
        this.grid = undefined;
    }

    /** State write guarded against late async writes after dispose. */
    private write(fn: (s: GitTreeState) => void): void {
        if (this.disposed) return;
        this.state.update(fn);
    }
}
