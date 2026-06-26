import { fpDirname, fpJoin } from "../../core/utils/file-path";
import { fs } from "../../api/fs";

// Cache of starting-directory → git root (or undefined). Walks are cheap but
// repeat often (every markdown link, plus notebook-embedded blocks share a path).
// The cache lives for the process lifetime with no invalidation — acceptable
// here because a `.git` location effectively never changes for an open file; a
// repo cloned into an already-resolved directory won't be picked up until
// restart. Lives in editors/ (not core/) because it imports api/fs.
const gitRootCache = new Map<string, string | undefined>();

/**
 * Walk up from a file's directory to the nearest ancestor containing a `.git`
 * entry (folder or file — worktrees/submodules use a `.git` file), and return
 * that ancestor as the repo/wiki root. Returns undefined if none is found.
 */
export async function detectGitRoot(filePath: string): Promise<string | undefined> {
    if (!filePath) return undefined;
    const startDir = fpDirname(filePath);
    if (gitRootCache.has(startDir)) return gitRootCache.get(startDir);

    let dir = startDir;
    for (;;) {
        const stat = await fs.stat(fpJoin(dir, ".git"));
        if (stat.exists) {
            gitRootCache.set(startDir, dir);
            return dir;
        }
        const parent = fpDirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    gitRootCache.set(startDir, undefined);
    return undefined;
}
