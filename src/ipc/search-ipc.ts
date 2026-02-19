/**
 * IPC channel definitions and types for file content search.
 *
 * Search uses a streaming pattern: renderer sends a start request,
 * main process streams back results per-file, then sends a complete message.
 * This is separate from the standard request/response Endpoint pattern
 * because search produces multiple response messages per request.
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
    includePattern: string;  // comma-separated globs, e.g. "*.ts,*.tsx"
    excludePattern: string;  // comma-separated globs, e.g. "node_modules,.git"
    caseSensitive: boolean;
    maxFileSize: number;     // bytes, files larger than this are skipped
    extensions: string[];    // file extensions to search (e.g. [".ts", ".tsx"])
}

// Main → Renderer (streamed per file)
export interface SearchFileResult {
    searchId: string;
    filePath: string;        // absolute path
    matches: SearchMatch[];
}

export interface SearchMatch {
    lineNumber: number;
    lineText: string;
    matchStart: number;      // character offset within the line
    matchLength: number;
}

// Main → Renderer (periodic progress)
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

// Default exclude patterns
export const defaultExcludePatterns = "node_modules,.git";

// Default max file size (1 MB)
export const defaultMaxFileSize = 1024 * 1024;
