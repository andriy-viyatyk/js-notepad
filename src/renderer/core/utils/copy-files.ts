// Recursive file/folder copy + move onto the local filesystem (US-807).
// Used by the Explorer tree's clipboard paste; built on `app.fs` per the
// no-direct-`fs` coding standard.

import { fs } from "../../api/fs";
import { fpBasename, fpJoin, fpNormalizeForCompare } from "./file-path";

export interface CopyPathsOptions {
    /** Move (cut-paste) instead of copy. Sources are removed only after their
     *  copy fully succeeds; a same-volume move uses a single rename. */
    move: boolean;
    /** Progress tick, called per file. `total` counts files (not directories). */
    onProgress?: (done: number, total: number, currentName: string) => void;
}

export interface CopyPathsResult {
    /** Number of files copied/moved. */
    copied: number;
    /** Per-item failure messages; empty when everything succeeded. */
    errors: string[];
}

interface SourceEntry {
    path: string;
    isDirectory: boolean;
    /** Recursive file count (1 for a plain file) — drives progress totals. */
    fileCount: number;
}

/**
 * Copy (or move) each of `sourcePaths` into `targetDir`, recursively for
 * directories. Existing same-named files are overwritten — collision
 * confirmation is the caller's responsibility (see os-clipboard.ts).
 *
 * Throws when a folder would be pasted into itself or a descendant.
 * Sources already at their destination (paste into their own parent) are
 * skipped silently. Per-item failures don't abort the batch — they are
 * collected into `errors`.
 */
export async function copyPathsInto(
    sourcePaths: string[],
    targetDir: string,
    opts: CopyPathsOptions,
): Promise<CopyPathsResult> {
    const result: CopyPathsResult = { copied: 0, errors: [] };
    const targetCmp = fpNormalizeForCompare(targetDir);

    const sources: SourceEntry[] = [];
    for (const src of sourcePaths) {
        const stat = await fs.stat(src);
        if (!stat.exists) {
            result.errors.push(`"${src}" no longer exists.`);
            continue;
        }
        const srcCmp = fpNormalizeForCompare(src);
        if (fpNormalizeForCompare(fpJoin(targetDir, fpBasename(src))) === srcCmp) {
            continue; // already in the target folder — nothing to do
        }
        if (stat.isDirectory && (targetCmp === srcCmp || targetCmp.startsWith(srcCmp + "/"))) {
            throw new Error(`Cannot paste folder "${fpBasename(src)}" into itself.`);
        }
        sources.push({
            path: src,
            isDirectory: stat.isDirectory,
            fileCount: stat.isDirectory ? await countFiles(src) : 1,
        });
    }

    const total = sources.reduce((sum, s) => sum + s.fileCount, 0);
    let done = 0;
    const tick = (name: string) => {
        done++;
        opts.onProgress?.(done, total, name);
    };

    for (const source of sources) {
        const dest = fpJoin(targetDir, fpBasename(source.path));
        try {
            if (opts.move) {
                // Fast path: plain rename (same volume, destination free).
                const destStat = await fs.stat(dest);
                if (!destStat.exists) {
                    try {
                        await fs.rename(source.path, dest);
                        done += source.fileCount;
                        result.copied += source.fileCount;
                        opts.onProgress?.(done, total, fpBasename(source.path));
                        continue;
                    } catch {
                        // Cross-volume (EXDEV) or locked — fall through to copy + delete.
                    }
                }
                result.copied += await copyEntry(source.path, dest, source.isDirectory, tick);
                if (source.isDirectory) {
                    await fs.removeDir(source.path, true);
                } else {
                    await fs.delete(source.path);
                }
            } else {
                result.copied += await copyEntry(source.path, dest, source.isDirectory, tick);
            }
        } catch (err) {
            result.errors.push(`${fpBasename(source.path)}: ${err?.message ?? err}`);
        }
    }

    return result;
}

async function countFiles(dirPath: string): Promise<number> {
    let count = 0;
    for (const entry of await fs.listDirWithTypes(dirPath)) {
        count += entry.isDirectory
            ? await countFiles(fpJoin(dirPath, entry.name))
            : 1;
    }
    return count;
}

/** Copy one file or directory subtree. Returns the number of files copied. */
async function copyEntry(
    src: string,
    dest: string,
    isDirectory: boolean,
    tick: (name: string) => void,
): Promise<number> {
    if (!isDirectory) {
        await fs.copyFile(src, dest);
        tick(fpBasename(src));
        return 1;
    }
    let copied = 0;
    await fs.mkdir(dest);
    for (const entry of await fs.listDirWithTypes(src)) {
        copied += await copyEntry(
            fpJoin(src, entry.name),
            fpJoin(dest, entry.name),
            entry.isDirectory,
            tick,
        );
    }
    return copied;
}
