/**
 * FileSearchModel — standalone search state and IPC communication.
 *
 * Manages search query, include/exclude patterns, IPC with the main process
 * search service, and accumulated results as a flat array of SearchResultRow.
 *
 * Extracted from NavigationSearchModel for reuse outside NavigationPanel.
 */
import { TComponentState } from "../../core/state/state";
import { debounce } from "../../../shared/utils";
import {
    SearchChannel,
    SearchRequest,
    SearchCancel,
    SearchResultBatch,
    SearchProgress,
    SearchComplete,
    SearchError,
} from "../../../ipc/search-ipc";
import { settings } from "../../api/settings";
import { fpBasename } from "../../core/utils/file-path";

const { ipcRenderer } = require("electron");

// =============================================================================
// Types
// =============================================================================

export interface SearchResultFileRow {
    type: "file";
    filePath: string;
    fileName: string;
    matchedLinesCount: number;
    expanded: boolean;
}

export interface SearchResultLineRow {
    type: "line";
    filePath: string;
    lineNumber: number;
    lineText: string;
    matchStart: number;
    matchLength: number;
}

export type SearchResultRow = SearchResultFileRow | SearchResultLineRow;

export interface FileSearchState {
    query: string;
    includePattern: string;
    excludePattern: string;
    showFilters: boolean;
    /** Subfolder scope (from "Search in folder"). Empty = search from root. */
    searchFolder: string;
    /** Full flat result array (file + line rows). */
    results: SearchResultRow[];
    totalMatches: number;
    totalFiles: number;
}

/**
 * Reactive state. Note what is NOT here: the result rows themselves.
 *
 * `TOneState.update` runs immer `produce`, so keeping the accumulating array in state would
 * copy the whole array on every arriving batch — quadratic over a large search, on top of the
 * full re-render each copy triggers. The rows live in a plain field on the model instead, and
 * `resultsVersion` is the cheap signal the view watches.
 */
export interface FileSearchInternalState
    extends Omit<FileSearchState, "results"> {
    isSearching: boolean;
    filesSearched: number;
    /** Bumped once per arriving batch — the view's cue to rebuild its filtered rows. */
    resultsVersion: number;
    /** True when the search stopped early at the result cap. */
    truncated: boolean;
}

export const defaultFileSearchState: FileSearchInternalState = {
    query: "",
    includePattern: "",
    excludePattern: "",
    showFilters: false,
    searchFolder: "",
    isSearching: false,
    totalMatches: 0,
    totalFiles: 0,
    filesSearched: 0,
    resultsVersion: 0,
    truncated: false,
};

// =============================================================================
// Model
// =============================================================================

let searchIdCounter = 0;

export class FileSearchModel {
    state: TComponentState<FileSearchInternalState>;

    /** Accumulated result rows — deliberately outside the immer-managed state (see above). */
    private allResults: SearchResultRow[] = [];

    private currentSearchId: string | null = null;
    private disposed = false;
    private ipcListeners: Array<{ channel: string; handler: (...args: any[]) => void }> = []; // eslint-disable-line @typescript-eslint/no-explicit-any
    private rootPath: string;
    private onStateChange?: (state: FileSearchState) => void;

    constructor(rootPath: string, savedState?: FileSearchState, onStateChange?: (state: FileSearchState) => void) {
        this.rootPath = rootPath;
        this.onStateChange = onStateChange;

        // Restore from saved state or use defaults
        const initial: FileSearchInternalState = savedState
            ? {
                  ...savedState,
                  isSearching: false,
                  filesSearched: 0,
                  resultsVersion: 0,
                  truncated: false,
              }
            : { ...defaultFileSearchState };
        this.allResults = savedState?.results ?? [];

        this.state = new TComponentState<FileSearchInternalState>(initial);
        this.subscribeToIpc();
    }

    // ── IPC ───────────────────────────────────────────────────────────

    private onIpc<T>(channel: string, callback: (data: T) => void) {
        const handler = (_event: unknown, data: T) => {
            if (!this.disposed) callback(data);
        };
        ipcRenderer.on(channel, handler);
        this.ipcListeners.push({ channel, handler });
    }

    private subscribeToIpc = () => {
        this.onIpc<SearchResultBatch>(SearchChannel.result, (data) => {
            if (data.searchId !== this.currentSearchId) return;

            let batchMatches = 0;
            for (const file of data.files) {
                this.allResults.push({
                    type: "file",
                    filePath: file.filePath,
                    fileName: fpBasename(file.filePath),
                    matchedLinesCount: file.matches.length,
                    expanded: true,
                });
                // Deduplicate lines by lineNumber (multiple matches on same line → show first)
                const seenLines = new Set<number>();
                for (const m of file.matches) {
                    if (!seenLines.has(m.lineNumber)) {
                        seenLines.add(m.lineNumber);
                        this.allResults.push({
                            type: "line",
                            filePath: file.filePath,
                            lineNumber: m.lineNumber,
                            lineText: m.lineText,
                            matchStart: m.matchStart,
                            matchLength: m.matchLength,
                        });
                    }
                }
                batchMatches += file.matches.length;
            }

            // One state write per batch, regardless of how many files it carried.
            this.state.update((s) => {
                s.totalMatches += batchMatches;
                s.totalFiles += data.files.length;
                s.filesSearched = data.filesSearched;
                s.resultsVersion += 1;
            });
        });

        this.onIpc<SearchProgress>(SearchChannel.progress, (data) => {
            if (data.searchId !== this.currentSearchId) return;
            this.state.update((s) => {
                s.filesSearched = data.filesSearched;
            });
        });

        this.onIpc<SearchComplete>(SearchChannel.complete, (data) => {
            if (data.searchId !== this.currentSearchId) return;
            this.state.update((s) => {
                s.isSearching = false;
                s.filesSearched = data.filesSearched;
                s.totalMatches = data.totalMatches;
                s.totalFiles = data.totalFiles;
                s.truncated = data.truncated;
            });
            this.emitStateChange();
        });

        this.onIpc<SearchError>(SearchChannel.error, (data) => {
            if (data.searchId !== this.currentSearchId) return;
            this.state.update((s) => {
                s.isSearching = false;
            });
            console.error("Search error:", data.message);
        });
    };

    // ── Search ────────────────────────────────────────────────────────

    private sendSearch = () => {
        if (this.disposed) return;
        const { query, includePattern, excludePattern, searchFolder } = this.state.get();
        if (!query.trim()) {
            this.cancelSearch();
            return;
        }

        const searchId = `search-${++searchIdCounter}`;
        this.currentSearchId = searchId;

        this.allResults = [];
        this.state.update((s) => {
            s.isSearching = true;
            s.totalMatches = 0;
            s.totalFiles = 0;
            s.filesSearched = 0;
            s.truncated = false;
            s.resultsVersion += 1;
        });

        const request: SearchRequest = {
            searchId,
            rootPath: searchFolder || this.rootPath,
            query: query.trim(),
            includePattern,
            excludePattern,
            caseSensitive: false,
            maxFileSize: settings.get("search-max-file-size"),
            extensions: settings.get("search-extensions"),
            excludePatterns: settings.get("search-exclude"),
        };

        ipcRenderer.send(SearchChannel.start, request);
    };

    private sendSearchDebounced = debounce(this.sendSearch, 500);

    private cancelSearch = () => {
        if (this.disposed) return;
        if (this.currentSearchId) {
            const cancel: SearchCancel = { searchId: this.currentSearchId };
            ipcRenderer.send(SearchChannel.cancel, cancel);
            this.currentSearchId = null;
            this.state.update((s) => {
                s.isSearching = false;
            });
        }
    };

    private emitStateChange = () => {
        if (!this.onStateChange) return;
        const { query, includePattern, excludePattern, showFilters, searchFolder, totalMatches, totalFiles } = this.state.get();
        this.onStateChange({
            query,
            includePattern,
            excludePattern,
            showFilters,
            searchFolder,
            results: this.allResults,
            totalMatches,
            totalFiles,
        });
    };

    // ── Public API ────────────────────────────────────────────────────

    setQuery = (query: string) => {
        this.state.update((s) => { s.query = query; });
        if (query.trim()) {
            this.sendSearchDebounced();
        } else {
            this.cancelSearch();
            this.allResults = [];
            this.state.update((s) => {
                s.totalMatches = 0;
                s.totalFiles = 0;
                s.filesSearched = 0;
                s.truncated = false;
                s.resultsVersion += 1;
            });
            this.emitStateChange();
        }
    };

    setIncludePattern = (pattern: string) => {
        this.state.update((s) => { s.includePattern = pattern; });
        if (this.state.get().query.trim()) {
            this.sendSearchDebounced();
        }
    };

    setExcludePattern = (pattern: string) => {
        this.state.update((s) => { s.excludePattern = pattern; });
        if (this.state.get().query.trim()) {
            this.sendSearchDebounced();
        }
    };

    setSearchFolder = (folder: string) => {
        this.state.update((s) => { s.searchFolder = folder; });
        if (this.state.get().query.trim()) {
            this.sendSearchDebounced();
        }
    };

    toggleFilters = () => {
        this.state.update((s) => { s.showFilters = !s.showFilters; });
    };

    /** Trigger search immediately (Enter key or Refresh button). */
    triggerSearch = () => {
        if (this.state.get().query.trim()) {
            this.sendSearch();
        }
    };

    /** Toggle file row expand/collapse and rebuild filtered view. */
    toggleFileExpanded = (filePath: string) => {
        const fileRow = this.allResults.find(
            (r): r is SearchResultFileRow => r.type === "file" && r.filePath === filePath,
        );
        if (!fileRow) return;
        fileRow.expanded = !fileRow.expanded;
        this.state.update((s) => {
            s.resultsVersion += 1;
        });
    };

    /** Build filtered result array (collapsed files have their lines removed). */
    getFilteredResults(): SearchResultRow[] {
        const results = this.allResults;
        const filtered: SearchResultRow[] = [];
        let currentFileExpanded = true;

        for (const row of results) {
            if (row.type === "file") {
                filtered.push(row);
                currentFileExpanded = row.expanded;
            } else if (currentFileExpanded) {
                filtered.push(row);
            }
        }
        return filtered;
    }

    clearSearch = () => {
        this.cancelSearch();
        this.allResults = [];
        this.state.update((s) => {
            s.query = "";
            s.includePattern = "";
            s.excludePattern = "";
            s.isSearching = false;
            s.totalMatches = 0;
            s.totalFiles = 0;
            s.filesSearched = 0;
            s.truncated = false;
            s.resultsVersion += 1;
        });
        this.emitStateChange();
    };

    dispose = () => {
        if (this.disposed) return;
        const searchId = this.currentSearchId;
        this.disposed = true;
        this.currentSearchId = null;
        // Cancel carries this view's own search id (US-1041), so disposal can stop its worker
        // instead of letting it walk a tree nobody is watching. Safe even if another view has
        // since replaced this search: the main process compares ids and no-ops on a mismatch.
        // Sent directly rather than through cancelSearch(), which early-returns once disposed
        // and would touch state a disposed model must leave alone.
        if (searchId) {
            const cancel: SearchCancel = { searchId };
            ipcRenderer.send(SearchChannel.cancel, cancel);
        }
        this.ipcListeners.forEach(({ channel, handler }) => {
            ipcRenderer.removeListener(channel, handler);
        });
        this.ipcListeners = [];
    };
}
