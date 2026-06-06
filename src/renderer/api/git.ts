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
import type { GitRepoInfo, GitProbeResult } from "../../ipc/git-ipc";

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
};
