/**
 * IPC channel definitions and types for file content search.
 *
 * Search uses a streaming pattern: renderer sends a start request, the main process
 * streams back batches of matched files, then sends a complete message. This is separate
 * from the standard request/response Endpoint pattern because search produces multiple
 * response messages per request.
 *
 * The walk itself runs in a worker thread (`main/search-worker.ts`), so results are
 * coalesced into batches rather than sent per file — see `searchFlushIntervalMs`.
 */

// IPC channel names
export const SearchChannel = {
    start: "search:start",
    cancel: "search:cancel",
    result: "search:result",
    progress: "search:progress",
    complete: "search:complete",
    error: "search:error",
} as const;

// Renderer → Main
export interface SearchRequest {
    searchId: string;
    rootPath: string;
    query: string;
    includePattern: string;  // comma-separated globs from the panel, e.g. "*.ts,*.tsx"
    excludePattern: string;  // comma-separated globs from the panel, e.g. "dist,*.min.js"
    caseSensitive: boolean;
    maxFileSize: number;     // bytes, files larger than this are skipped
    extensions: string[];    // file extensions to search (e.g. [".ts", ".tsx"])
    /**
     * Always-on excludes from settings (`search-exclude`), applied ahead of `excludePattern`.
     * Never applied to the search root itself — searching *inside* an excluded folder such as
     * node_modules must work, while still skipping any nested one.
     */
    excludePatterns: string[];
}

export interface SearchCancel {
    searchId: string;
}

// One matched file within a batch
export interface SearchFileResult {
    filePath: string;        // absolute path
    matches: SearchMatch[];
}

export interface SearchMatch {
    lineNumber: number;
    lineText: string;
    matchStart: number;      // character offset within the line
    matchLength: number;
}

// Main → Renderer (streamed, one message per flush)
export interface SearchResultBatch {
    searchId: string;
    files: SearchFileResult[];
    /** Running total of files *examined* (not matched) — same counter as SearchProgress. */
    filesSearched: number;
}

// Main → Renderer (flush with no matched files — keeps the counter ticking)
export interface SearchProgress {
    searchId: string;
    filesSearched: number;
}

// Main → Renderer (final message)
export interface SearchComplete {
    searchId: string;
    totalMatches: number;
    totalFiles: number;
    filesSearched: number;
    /** True when the walk stopped early at `maxSearchResults`. */
    truncated: boolean;
}

// Main → Renderer (on error)
export interface SearchError {
    searchId: string;
    message: string;
}

// Default extensions considered searchable text files
export const defaultSearchableExtensions = [
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".json", ".jsonc", ".json5",
    ".html", ".htm", ".xml", ".svg",
    ".css", ".scss", ".sass", ".less",
    ".md", ".mdx", ".txt", ".log",
    ".yaml", ".yml", ".toml", ".ini", ".cfg", ".conf",
    ".env", ".gitignore", ".editorconfig",
    ".sh", ".bash", ".zsh", ".bat", ".cmd", ".ps1",
    ".py", ".rb", ".java", ".c", ".cpp", ".h", ".hpp", ".cs", ".go", ".rs", ".swift", ".kt",
    ".sql", ".graphql", ".gql",
    ".vue", ".svelte", ".astro",
    ".csv",
    ".todo.json",
];

// Default exclude patterns — seeds the `search-exclude` setting, which the renderer sends
// as `excludePatterns` on every request. A plain name excludes any folder with that name;
// a glob (containing / * ?) is matched against the path relative to the search root.
export const defaultExcludePatterns = ["node_modules", ".git"];

// Default max file size (1 MB)
export const defaultMaxFileSize = 1024 * 1024;

// Result batching — a flush is sent when either bound is reached
export const searchFlushIntervalMs = 100;
export const searchFlushMaxFiles = 50;

/**
 * Hard cap on matched lines — the line rows the user sees, with the per-file header rows on
 * top of that. Beyond this the walk stops and `SearchComplete.truncated` is set. Deliberately
 * not a setting: more than this is not reviewable by a human, and an uncapped search can
 * exhaust renderer memory.
 *
 * Checked between files, never inside one, so a file's matches are never cut in half — the
 * total can overshoot by at most one file's worth.
 */
export const maxSearchResults = 10000;
