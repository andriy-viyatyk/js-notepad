/**
 * Main-process git wrapper (EPIC-030 / US-610).
 *
 * Owns all `simple-git` usage — a thin promise wrapper over the user's
 * installed `git` CLI (no native bindings; no git binary bundled). Lazy-imported
 * by the IPC controller. Every operation is best-effort and NEVER throws: a
 * missing git binary or a non-repo directory resolves to a "not available"
 * result, so the renderer degrades gracefully (EPIC-030 Concern 4).
 *
 * v1 exposes exactly two operations — availability probe + repo detection.
 * Log/show/diff arrive with US-611/US-613 as further endpoints.
 */
import { simpleGit } from "simple-git";
import type { GitProbeResult, GitRepoInfo } from "../ipc/git-ipc";

/** `git --version` availability probe for the settings page. Never throws. */
export async function probeGit(): Promise<GitProbeResult> {
    try {
        const out = await simpleGit().raw(["--version"]); // "git version 2.43.0"
        const m = out.match(/(\d+\.\d+\.\d+)/);
        return { installed: true, version: m?.[1] };
    } catch {
        return { installed: false };
    }
}

/**
 * Resolve the repo root + branch for a directory. Returns `null` when `dir`
 * is not inside a git repo, or git is unavailable. Never throws.
 *
 * Uses `rev-parse --show-toplevel` — correct for submodules, worktrees, and
 * bare repos where `.git` is a FILE rather than a folder (so deliberately NOT
 * a hand-rolled `.git` directory walk).
 */
export async function detectRepo(dir: string): Promise<GitRepoInfo | null> {
    try {
        const git = simpleGit(dir);
        const root = (await git.revparse(["--show-toplevel"])).trim();
        if (!root) return null;
        let branch = "HEAD";
        try {
            branch = (await git.revparse(["--abbrev-ref", "HEAD"])).trim() || "HEAD";
        } catch {
            // Detached HEAD or a fresh repo with no commits — keep "HEAD".
        }
        return { root, branch };
    } catch {
        return null; // not a repo, or git missing → graceful (Concern 4)
    }
}
