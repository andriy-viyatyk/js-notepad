/**
 * Shared DTOs for git integration (EPIC-030).
 *
 * Plain data types crossing the main↔renderer IPC boundary for the git
 * request/response endpoints (`gitProbe`, `gitDetectRepo`). No main-only
 * dependencies live here so both `api-types.ts` (renderer-facing) and
 * `git-service.ts` (main) can import them.
 */

/** Result of the `git --version` availability probe (settings page). */
export interface GitProbeResult {
    installed: boolean;
    version?: string; // e.g. "2.43.0"
}

/** Repo membership for a directory. */
export interface GitRepoInfo {
    /** Absolute repo top-level (forward-slashed by git). */
    root: string;
    /** Current branch, or "HEAD" when detached / no commits yet. */
    branch: string;
}

/** Options for a `git log` query (EPIC-030 / US-611). */
export interface GitLogOptions {
    /** Cap on commits returned (Concern 7 — simple bounded load). Default 500.
     *  `0` (or negative) means no limit — load all commits ("Load all", US-612). */
    maxCount?: number;
    /** Skip the first N commits — pagination for "load more" (US-612). */
    skip?: number;
    /** Limit history to a single file (repo-relative or absolute), via `--follow`. */
    file?: string;
    /** Walk ALL refs (`git log --all`), not just HEAD — so the whole-repo Git Tree
     *  shows every branch's commits (like Git Extensions) even when HEAD is behind
     *  another branch. Omit/false for file-scoped history (US-636). */
    all?: boolean;
}

/** Kind of a decoration ref, used to color its label (US-611). */
export type GitRefKind = "head" | "branch" | "remote" | "tag";

/** A decoration ref at a commit (the prefix is parsed off into `kind`). */
export interface GitRef {
    /** Display name (e.g. "main", "v1.0", "origin/main"). */
    name: string;
    kind: GitRefKind;
}

/** One changed file in `git status` (EPIC-031 / US-616). */
export interface GitFileChange {
    /** Repo-relative path, forward-slashed. */
    path: string;
    /** Single-letter status code: M(odified) A(dded) D(eleted) R(enamed)
     *  C(opied) U(nmerged) ?(untracked). See `git-service.status()`. */
    status: string;
    /** Original path for renames/copies (R/C), forward-slashed. */
    oldPath?: string;
}

/** Result of a mutating git op (EPIC-031 / US-631). Never thrown across IPC —
 *  `ok:false` + message lets the renderer surface failure without a crash. */
export interface GitMutationResult {
    ok: boolean;
    error?: string;
}

/** Git author identity (EPIC-031 / US-632). Empty strings when unset in git config. */
export interface GitIdentity {
    name: string;
    email: string;
}

/** Target of a `git switch` (EPIC-031 / US-636). The renderer builds this from a
 *  clicked commit row or refs-panel node; the service maps it to a `git switch` form. */
export type GitSwitchTarget =
    | { type: "branch"; name: string }   // local branch → `git switch <name>`
    | { type: "remote"; ref: string }    // full remote ref "origin/feature/x" → tracking branch
    | { type: "commit"; hash: string }   // detached HEAD at a commit
    | { type: "tag"; name: string };     // detached HEAD at a tag

/** Split working-tree status for a repo (EPIC-031 / US-616). */
export interface GitStatusResult {
    /** Index (staged) changes. */
    staged: GitFileChange[];
    /** Working-tree (unstaged) changes, including untracked ('?'). */
    unstaged: GitFileChange[];
    /** Current branch name (simple-git status `.current`), or undefined when
     *  detached / no commits yet (EPIC-031 / US-632). */
    branch?: string;
}

/** Repository refs for the Git Tree "Branches & Tags" panel (EPIC-031 / US-634). */
export interface GitRefs {
    /** Current branch name (HEAD), or undefined when detached / no commits. */
    current?: string;
    /** Local branch names, e.g. "main", "feature/x". */
    localBranches: string[];
    /** Configured remote names, e.g. ["origin", "upstream"]. */
    remotes: string[];
    /** Remote-tracking branch names incl. remote prefix, e.g. "origin/main",
     *  "origin/feature/x". Excludes the symbolic "origin/HEAD". */
    remoteBranches: string[];
    /** Tag names, e.g. "v1.0.0". */
    tags: string[];
}

/** One commit row from `git log --topo-order` (EPIC-030 / US-611). */
export interface GitCommit {
    /** Full 40-char hash. */
    hash: string;
    /** Abbreviated hash for display (first 7). */
    shortHash: string;
    /** Parent hashes in order — parents[0] is the first parent. */
    parents: string[];
    /** First line of the commit message. */
    subject: string;
    authorName: string;
    /** Author email (`%ae`) — shown in the Git Tree "Commit" panel (US-629). */
    authorEmail: string;
    /** Commit (author) date as epoch ms. */
    authorDate: number;
    /** Decoration refs at this commit (branch/tag/HEAD), classified by kind. */
    refs: GitRef[];
}
