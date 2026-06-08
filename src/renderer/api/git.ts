/**
 * Renderer-side git API (EPIC-030 / US-610).
 *
 * Thin wrapper the text-file host calls to detect repo membership, plus the
 * settings-page availability probe. Owns the **per-directory detection cache**
 * (EPIC-030 Concern 2A): the first file opened in a folder spawns git; every
 * sibling is a cache hit. Negative results are cached too, so files outside any
 * repo never re-spawn git.
 *
 * Honors the "git.enabled" setting — when off, no git activity happens at all.
 */
import { fpDirname } from "../core/utils/file-path";
import { api } from "../../ipc/renderer/api";
import { settings } from "./settings";
import type { GitRepoInfo, GitProbeResult, GitCommit, GitLogOptions, GitStatusResult } from "../../ipc/git-ipc";

const EMPTY_STATUS: GitStatusResult = { staged: [], unstaged: [] };

// dir → resolved repo info (or null). Stores the in-flight promise so
// concurrent opens in the same directory collapse to a single git spawn.
// Lives for the process lifetime (v1 — no invalidation; EPIC-030 Concern E).
const repoCache = new Map<string, Promise<GitRepoInfo | null>>();

export const git = {
    /**
     * Detect repo membership for a file path. Returns `null` (no git spawn)
     * when the "git.enabled" setting is off, for untitled buffers, or for
     * archive entries (paths containing "!" are not real on-disk files).
     */
    detectRepoForFile(filePath: string | undefined): Promise<GitRepoInfo | null> {
        if (!settings.get("git.enabled") || !filePath || filePath.includes("!")) {
            return Promise.resolve(null);
        }
        const dir = fpDirname(filePath);
        if (!dir) return Promise.resolve(null);

        let p = repoCache.get(dir);
        if (!p) {
            p = api.gitDetectRepo(dir).catch((): GitRepoInfo | null => null);
            repoCache.set(dir, p);
        }
        return p;
    },

    /** Settings-page availability probe (`git --version`). Not cached. */
    probe(): Promise<GitProbeResult> {
        return api.gitProbe();
    },

    /**
     * Commit history for a repo root (optionally scoped to one file). Returns
     * `[]` (no git spawn) when the "git.enabled" setting is off or no root is
     * given. Not cached — history changes between calls (EPIC-030 / US-611).
     */
    log(repoRoot: string, opts: GitLogOptions = {}): Promise<GitCommit[]> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve([]);
        return api.gitLog(repoRoot, opts).catch((): GitCommit[] => []);
    },

    /**
     * Blob content of `relPath` at a revision (EPIC-030 / US-613). `rev` is ""
     * (the index — staged blob if staged, else HEAD), "HEAD", or a commit hash.
     * `relPath` is repo-relative (forward slashes). Returns "" when git is off,
     * no root/path, or the path is absent at that revision. Never throws.
     */
    show(repoRoot: string, rev: string, relPath: string): Promise<string> {
        if (!settings.get("git.enabled") || !repoRoot || !relPath) return Promise.resolve("");
        return api.gitShow(repoRoot, rev, relPath).catch((): string => "");
    },

    /**
     * Working-tree status for a repo root, split into staged / unstaged
     * (EPIC-031 / US-616). Untracked files arrive under `unstaged` ('?');
     * ignored files are omitted. Returns empty arrays (no git spawn) when the
     * "git.enabled" setting is off or no root is given. Never throws.
     */
    status(repoRoot: string): Promise<GitStatusResult> {
        if (!settings.get("git.enabled") || !repoRoot) return Promise.resolve(EMPTY_STATUS);
        return api.gitStatus(repoRoot).catch((): GitStatusResult => EMPTY_STATUS);
    },
};
