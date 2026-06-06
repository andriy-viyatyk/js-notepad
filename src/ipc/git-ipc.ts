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
