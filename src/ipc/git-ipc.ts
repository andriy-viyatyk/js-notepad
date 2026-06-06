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
}

/** Kind of a decoration ref, used to color its label (US-611). */
export type GitRefKind = "head" | "branch" | "remote" | "tag";

/** A decoration ref at a commit (the prefix is parsed off into `kind`). */
export interface GitRef {
    /** Display name (e.g. "main", "v1.0", "origin/main"). */
    name: string;
    kind: GitRefKind;
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
    /** Commit (author) date as epoch ms. */
    authorDate: number;
    /** Decoration refs at this commit (branch/tag/HEAD), classified by kind. */
    refs: GitRef[];
}
