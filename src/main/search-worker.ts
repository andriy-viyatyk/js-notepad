/**
 * File-content search worker.
 *
 * Walks a directory tree, reads text files, and matches lines against a query. Runs in a
 * worker thread so the walk — which is entirely synchronous fs I/O — never occupies the
 * main-process event loop. Blocking main would freeze the window message pump, make the
 * app unclosable, and (worse) make cancellation impossible, since the cancel IPC handler
 * could not run until the search it was meant to stop had already finished.
 *
 * There is no cancellation flag here by design: the host cancels with `worker.terminate()`.
 *
 * This module is bundled to `.vite/build/search-worker.js` and loaded by `search-service.ts`
 * as SOURCE via `new Worker(src, { eval: true })` — see that file for why. Two consequences:
 *   - It must NOT import `electron`.
 *   - Every surviving `require` in the bundle must be a node builtin, so npm dependencies
 *     (picomatch) have to be bundled in rather than externalized.
 *
 * Protocol:
 *   Host → Worker:  { type: "search", request: SearchRequest }
 *   Worker → Host:  { type: "batch", files, filesSearched }
 *   Worker → Host:  { type: "progress", filesSearched }
 *   Worker → Host:  { type: "complete", totalMatches, totalFiles, filesSearched, truncated }
 *   Worker → Host:  { type: "error", message }
 */
import fs from "node:fs";
import path from "node:path";
import { parentPort } from "node:worker_threads";
import picomatch from "picomatch";
import {
    SearchRequest,
    SearchFileResult,
    SearchMatch,
    defaultSearchableExtensions,
    defaultMaxFileSize,
    searchFlushIntervalMs,
    searchFlushMaxFiles,
    maxSearchResults,
} from "../ipc/search-ipc";

/** Worker → Host messages (see protocol above). */
export type SearchWorkerMessage =
    | { type: "batch"; files: SearchFileResult[]; filesSearched: number }
    | { type: "progress"; filesSearched: number }
    | {
          type: "complete";
          totalMatches: number;
          totalFiles: number;
          filesSearched: number;
          truncated: boolean;
      }
    | { type: "error"; message: string };

/** Host → Worker messages. */
export type SearchHostMessage = { type: "search"; request: SearchRequest };

/**
 * Parse a comma-separated pattern string into individual trimmed patterns.
 */
function parsePatterns(input: string): string[] {
    return input
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p.length > 0);
}

/**
 * Build a matcher function from include patterns.
 * If no patterns provided, returns a function that accepts all files.
 * Patterns like "*.ts" are matched against the file name only.
 * Patterns with "/" or "**" are matched against the relative path.
 */
function buildIncludeMatcher(patterns: string[]): (relPath: string) => boolean {
    if (patterns.length === 0) return () => true;

    const matchers = patterns.map((p) => {
        const matchesPath = p.includes("/") || p.includes("**");
        const isMatch = picomatch(p, { dot: true });
        return (relPath: string) => {
            if (matchesPath) {
                return isMatch(relPath);
            }
            return isMatch(path.basename(relPath));
        };
    });

    return (relPath: string) => matchers.some((m) => m(relPath));
}

/**
 * Build a matcher function from exclude patterns.
 * Simple names like "node_modules" match any directory segment.
 * Glob patterns like "dist/**" match against relative path.
 */
function buildExcludeMatcher(
    patterns: string[]
): { matchDir: (dirName: string) => boolean; matchFile: (relPath: string) => boolean } {
    const dirNames: string[] = [];
    const fileMatchers: Array<(relPath: string) => boolean> = [];

    for (const p of patterns) {
        if (!p.includes("/") && !p.includes("*") && !p.includes("?")) {
            // Simple name — matches a directory name exactly
            dirNames.push(p);
        } else {
            const isMatch = picomatch(p, { dot: true });
            fileMatchers.push((relPath) => isMatch(relPath));
        }
    }

    return {
        matchDir: (dirName: string) => dirNames.includes(dirName),
        matchFile: (relPath: string) =>
            dirNames.some((d) => relPath.includes(d + "/") || relPath.includes(d + "\\")) ||
            fileMatchers.some((m) => m(relPath)),
    };
}

/**
 * Check if a file is likely a text file by reading its first bytes.
 * Files with null bytes in the first 512 bytes are considered binary.
 */
function isLikelyTextFile(filePath: string): boolean {
    try {
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(512);
        const bytesRead = fs.readSync(fd, buffer, 0, 512, 0);
        fs.closeSync(fd);
        for (let i = 0; i < bytesRead; i++) {
            if (buffer[i] === 0) return false;
        }
        return true;
    } catch {
        return false;
    }
}

/**
 * Search file contents line by line.
 *
 * `matchedLines` counts DISTINCT lines that matched, which is the number of rows the user
 * will see — three hits on one line render as one row. It is what the result cap is measured
 * in. `matches` still carries every hit, because the status line's match total counts hits.
 */
function searchFileContent(
    filePath: string,
    query: string,
    caseSensitive: boolean
): { matches: SearchMatch[]; matchedLines: number } {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    const matches: SearchMatch[] = [];
    const searchQuery = caseSensitive ? query : query.toLowerCase();
    let matchedLines = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const searchLine = caseSensitive ? line : line.toLowerCase();
        let startIndex = 0;
        let lineCounted = false;

        for (;;) {
            const matchIndex = searchLine.indexOf(searchQuery, startIndex);
            if (matchIndex === -1) break;

            if (!lineCounted) {
                lineCounted = true;
                matchedLines++;
            }

            matches.push({
                lineNumber: i + 1,
                lineText: line.length > 500 ? line.substring(0, 500) : line,
                matchStart: matchIndex,
                matchLength: query.length,
            });

            startIndex = matchIndex + 1;
        }
    }

    return { matches, matchedLines };
}

/**
 * Recursively walk a directory and search files, posting batched results to the host.
 */
function executeSearch(request: SearchRequest, post: (msg: SearchWorkerMessage) => void): void {
    const {
        rootPath,
        query,
        includePattern,
        excludePattern,
        caseSensitive,
        maxFileSize,
    } = request;

    // Settings excludes first, then the panel's Exclude box.
    //
    // Both are only ever tested against paths BELOW the root: `matchDir` sees child directory
    // names discovered during the walk (the root is seeded into the stack directly), and
    // `matchFile` sees paths relative to the root. So searching inside an excluded folder —
    // node_modules, say — searches it, while any nested one is still skipped.
    const includePatterns = parsePatterns(includePattern);
    const excludePatterns = [
        ...(request.excludePatterns ?? []),
        ...parsePatterns(excludePattern),
    ];
    const includeMatcher = buildIncludeMatcher(includePatterns);
    const excludeMatcher = buildExcludeMatcher(excludePatterns);

    // Determine searchable extensions set
    const extensionSet = new Set(request.extensions?.length ? request.extensions : defaultSearchableExtensions);

    let filesSearched = 0;
    let totalMatches = 0;
    let totalFiles = 0;
    let matchedLines = 0;
    let truncated = false;

    // Pending batch — flushed on either bound, so a tree with no matches still ticks the counter.
    let pending: SearchFileResult[] = [];
    let lastFlushTime = Date.now();

    const flush = () => {
        lastFlushTime = Date.now();
        if (pending.length > 0) {
            post({ type: "batch", files: pending, filesSearched });
            pending = [];
        } else {
            post({ type: "progress", filesSearched });
        }
    };

    const flushIfDue = () => {
        if (pending.length >= searchFlushMaxFiles || Date.now() - lastFlushTime >= searchFlushIntervalMs) {
            flush();
        }
    };

    // Iterative directory walk using a stack (avoids deep recursion)
    const dirStack: string[] = [rootPath];

    walk: while (dirStack.length > 0) {
        const currentDir = dirStack.pop() as string;
        let entries: fs.Dirent[];

        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
            continue; // Skip inaccessible directories
        }

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);

            if (entry.isDirectory()) {
                // Check if directory should be excluded
                if (!excludeMatcher.matchDir(entry.name)) {
                    dirStack.push(fullPath);
                }
                continue;
            }

            if (!entry.isFile()) continue;

            const relPath = path.relative(rootPath, fullPath).replace(/\\/g, "/");

            // Check exclude patterns on file
            if (excludeMatcher.matchFile(relPath)) continue;

            // Check file extension
            const ext = path.extname(entry.name).toLowerCase();
            const hasKnownExtension = ext && extensionSet.has(ext);

            // If include patterns specified, use them; otherwise use extension list
            if (includePatterns.length > 0) {
                if (!includeMatcher(relPath)) continue;
            } else {
                if (!hasKnownExtension) {
                    // No known extension — check if it's a text file
                    if (ext) continue; // Has extension but not in the list
                    if (!isLikelyTextFile(fullPath)) continue;
                }
            }

            // Check file size
            try {
                const stats = fs.statSync(fullPath);
                if (stats.size > (maxFileSize || defaultMaxFileSize)) continue;
                if (stats.size === 0) continue;
            } catch {
                continue;
            }

            // Search file content
            const found = searchFileContent(fullPath, query, caseSensitive);
            filesSearched++;

            if (found.matches.length > 0) {
                totalMatches += found.matches.length;
                totalFiles++;
                matchedLines += found.matchedLines;
                pending.push({ filePath: fullPath, matches: found.matches });
            }

            flushIfDue();

            // Cap is checked between files, never inside one: cutting a file's matches short
            // would leave its row count disagreeing with the rows shown beneath it. Overshooting
            // by at most one file's worth is the cheaper inconsistency.
            if (matchedLines >= maxSearchResults) {
                truncated = true;
                break walk;
            }
        }
    }

    if (pending.length > 0) {
        post({ type: "batch", files: pending, filesSearched });
    }

    post({ type: "complete", totalMatches, totalFiles, filesSearched, truncated });
}

parentPort?.on("message", (msg: SearchHostMessage) => {
    if (msg.type !== "search") return;
    const post = (out: SearchWorkerMessage) => parentPort?.postMessage(out);
    try {
        executeSearch(msg.request, post);
    } catch (e) {
        post({ type: "error", message: e instanceof Error ? e.message : String(e) });
    }
});
