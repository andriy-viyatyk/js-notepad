export interface IGitRefSnapshot {
    readonly name: string;
    readonly kind: "head" | "branch" | "remote" | "tag";
}

export interface IGitCommitSnapshot {
    readonly hash: string;
    readonly shortHash: string;
    readonly parents: readonly string[];
    readonly subject: string;
    readonly authorName: string;
    readonly authorEmail: string;
    readonly authorDate: number;
    readonly refs: readonly IGitRefSnapshot[];
}

export interface IGitFileChangeSnapshot {
    readonly path: string;
    readonly status: string;
    readonly oldPath?: string;
}

export interface IGitChangesSnapshot {
    readonly staged: readonly IGitFileChangeSnapshot[];
    readonly unstaged: readonly IGitFileChangeSnapshot[];
}

export interface IGitRefsSnapshot {
    readonly current: string | undefined;
    readonly localBranches: readonly string[];
    readonly remotes: readonly string[];
    readonly remoteBranches: readonly string[];
    readonly tags: readonly string[];
}

export interface IGitAheadBehindSnapshot {
    readonly ahead: number;
    readonly behind: number;
    readonly upstream: string | undefined;
    readonly hasUpstream: boolean;
}

export type IGitRefNodeKind = "branch" | "remote-branch" | "tag";
export type IGitChangeList = "unstaged" | "staged";

export interface IGitTreeEditor {
    readonly id: "git-tree";
    readonly name: string;
    readonly repoRoot: string | undefined;
    readonly currentRef: string | undefined;
    readonly commits: readonly IGitCommitSnapshot[] | undefined;
    readonly loadedCommitCount: number | undefined;
    readonly hasMore: boolean | undefined;
    readonly selectedCommitHash: string | undefined;
    readonly selectedCommit: IGitCommitSnapshot | undefined;
    readonly changes: IGitChangesSnapshot | undefined;
    readonly refs: IGitRefsSnapshot | undefined;
    readonly aheadBehind: IGitAheadBehindSnapshot | undefined;

    refresh(): void;
    loadMore(): Promise<void>;
    openChange(path: string, list?: IGitChangeList): void;
    revealRef(name: string, kind: IGitRefNodeKind): void;
}
