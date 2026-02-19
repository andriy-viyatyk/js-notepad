/**
 * Main process file content search service.
 *
 * Walks a directory tree, reads text files, and matches lines against a query.
 * Results are streamed per-file via IPC to the renderer process.
 * Supports cancellation, include/exclude glob patterns, and file size limits.
 */
import fs from "node:fs";
import path from "node:path";
import { ipcMain, IpcMainEvent } from "electron";
import picomatch from "picomatch";
import {
    SearchChannel,
    SearchRequest,
    SearchFileResult,
    SearchMatch,
    SearchProgress,
    SearchComplete,
    SearchError,
    defaultSearchableExtensions,
    defaultMaxFileSize,
    defaultExcludePatterns,
} from "../ipc/search-ipc";

// Active search per sender (webContents id → searchId)
const activeSearches = new Map<number, string>();

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
 * Search file contents line by line and return matches.
 */
function searchFileContent(
    filePath: string,
    query: string,
    caseSensitive: boolean
): SearchMatch[] {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);
    const matches: SearchMatch[] = [];
    const searchQuery = caseSensitive ? query : query.toLowerCase();

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const searchLine = caseSensitive ? line : line.toLowerCase();
        let startIndex = 0;

        for (;;) {
            const matchIndex = searchLine.indexOf(searchQuery, startIndex);
            if (matchIndex === -1) break;

            matches.push({
                lineNumber: i + 1,
                lineText: line.length > 500 ? line.substring(0, 500) : line,
                matchStart: matchIndex,
                matchLength: query.length,
            });

            startIndex = matchIndex + 1;
        }
    }

    return matches;
}

/**
 * Recursively walk a directory and search files.
 * Results are sent via IPC as they are found.
 */
async function executeSearch(
    event: IpcMainEvent,
    request: SearchRequest
): Promise<void> {
    const {
        searchId,
        rootPath,
        query,
        includePattern,
        excludePattern,
        caseSensitive,
        maxFileSize,
    } = request;

    const senderId = event.sender.id;

    // Merge default excludes with user excludes
    const allExcludes = defaultExcludePatterns
        ? defaultExcludePatterns + (excludePattern ? "," + excludePattern : "")
        : excludePattern;

    const includePatterns = parsePatterns(includePattern);
    const excludePatterns = parsePatterns(allExcludes);
    const includeMatcher = buildIncludeMatcher(includePatterns);
    const excludeMatcher = buildExcludeMatcher(excludePatterns);

    // Determine searchable extensions set
    const extensionSet = new Set(request.extensions?.length ? request.extensions : defaultSearchableExtensions);

    let filesSearched = 0;
    let totalMatches = 0;
    let totalFiles = 0;
    let lastProgressTime = Date.now();

    const isCancelled = () => activeSearches.get(senderId) !== searchId;

    // Iterative directory walk using a stack (avoids deep recursion)
    const dirStack: string[] = [rootPath];

    while (dirStack.length > 0) {
        if (isCancelled()) return;

        const currentDir = dirStack.pop() as string;
        let entries: fs.Dirent[];

        try {
            entries = fs.readdirSync(currentDir, { withFileTypes: true });
        } catch {
            continue; // Skip inaccessible directories
        }

        for (const entry of entries) {
            if (isCancelled()) return;

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
            const matches = searchFileContent(fullPath, query, caseSensitive);
            filesSearched++;

            if (matches.length > 0) {
                totalMatches += matches.length;
                totalFiles++;

                const result: SearchFileResult = {
                    searchId,
                    filePath: fullPath,
                    matches,
                };

                if (!isCancelled()) {
                    event.sender.send(SearchChannel.result, result);
                }
            }

            // Send progress every 200ms
            const now = Date.now();
            if (now - lastProgressTime > 200) {
                lastProgressTime = now;
                if (!isCancelled()) {
                    const progress: SearchProgress = {
                        searchId,
                        filesSearched,
                    };
                    event.sender.send(SearchChannel.progress, progress);
                }
            }
        }
    }

    if (!isCancelled()) {
        const complete: SearchComplete = {
            searchId,
            totalMatches,
            totalFiles,
            filesSearched,
        };
        event.sender.send(SearchChannel.complete, complete);
    }
}

/**
 * Initialize search IPC handlers. Call once during app startup.
 */
export function initSearchHandlers(): void {
    ipcMain.on(SearchChannel.start, (event, request: SearchRequest) => {
        const senderId = event.sender.id;

        // Cancel any previous search from this sender
        activeSearches.set(senderId, request.searchId);

        // Run search asynchronously
        executeSearch(event, request).catch((err) => {
            const error: SearchError = {
                searchId: request.searchId,
                message: err?.message || "Search failed",
            };
            try {
                event.sender.send(SearchChannel.error, error);
            } catch {
                // Sender may have been destroyed
            }
        });
    });

    ipcMain.on(SearchChannel.cancel, (event) => {
        const senderId = event.sender.id;
        activeSearches.delete(senderId);
    });
}
