/**
 * Renderer-side search state management for NavigationPanel.
 *
 * Manages search query, include/exclude patterns, IPC communication
 * with the main process search service, and accumulated results.
 */
import { TComponentState } from "../../core/state/state";
import { debounce } from "../../../shared/utils";
import {
    SearchChannel,
    SearchRequest,
    SearchFileResult,
    SearchProgress,
    SearchComplete,
    SearchError,
    SearchMatch,
} from "../../../ipc/search-ipc";
import { appSettings } from "../../store/app-settings";

const { ipcRenderer } = require("electron");

export interface FileSearchResult {
    filePath: string;
    matches: SearchMatch[];
}

export interface SearchState {
    searchOpen: boolean;
    query: string;
    includePattern: string;
    excludePattern: string;
    showFilters: boolean;
    isSearching: boolean;
    results: FileSearchResult[];
    totalMatches: number;
    totalFiles: number;
    filesSearched: number;
}

const defaultSearchState: SearchState = {
    searchOpen: false,
    query: "",
    includePattern: "",
    excludePattern: "",
    showFilters: false,
    isSearching: false,
    results: [],
    totalMatches: 0,
    totalFiles: 0,
    filesSearched: 0,
};

let searchIdCounter = 0;

export class NavigationSearchModel {
    state: TComponentState<SearchState>;
    private currentSearchId: string | null = null;
    private ipcListeners: Array<{ channel: string; handler: (...args: any[]) => void }> = [];
    private getRootPath: () => string;

    constructor(getRootPath: () => string) {
        this.state = new TComponentState<SearchState>(defaultSearchState);
        this.getRootPath = getRootPath;
        this.subscribeToIpc();
    }

    private onIpc<T>(channel: string, callback: (data: T) => void) {
        const handler = (_event: any, data: T) => callback(data);
        ipcRenderer.on(channel, handler);
        this.ipcListeners.push({ channel, handler });
    }

    private subscribeToIpc = () => {
        this.onIpc<SearchFileResult>(SearchChannel.result, (data) => {
            if (data.searchId !== this.currentSearchId) return;
            this.state.update((s) => {
                s.results.push({
                    filePath: data.filePath,
                    matches: data.matches,
                });
                s.totalMatches += data.matches.length;
                s.totalFiles += 1;
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
            });
        });

        this.onIpc<SearchError>(SearchChannel.error, (data) => {
            if (data.searchId !== this.currentSearchId) return;
            this.state.update((s) => {
                s.isSearching = false;
            });
            console.error("Search error:", data.message);
        });
    };

    private sendSearch = () => {
        const { query, includePattern, excludePattern } = this.state.get();
        if (!query.trim()) {
            this.cancelSearch();
            return;
        }

        const searchId = `search-${++searchIdCounter}`;
        this.currentSearchId = searchId;

        // Reset results for new search
        this.state.update((s) => {
            s.isSearching = true;
            s.results = [];
            s.totalMatches = 0;
            s.totalFiles = 0;
            s.filesSearched = 0;
        });

        const request: SearchRequest = {
            searchId,
            rootPath: this.getRootPath(),
            query: query.trim(),
            includePattern,
            excludePattern,
            caseSensitive: false,
            maxFileSize: appSettings.get("search-max-file-size"),
            extensions: appSettings.get("search-extensions"),
        };

        ipcRenderer.send(SearchChannel.start, request);
    };

    private sendSearchDebounced = debounce(this.sendSearch, 500);

    setQuery = (query: string) => {
        this.state.update((s) => {
            s.query = query;
        });
        if (query.trim()) {
            this.sendSearchDebounced();
        } else {
            this.cancelSearch();
            this.state.update((s) => {
                s.results = [];
                s.totalMatches = 0;
                s.totalFiles = 0;
                s.filesSearched = 0;
            });
        }
    };

    setIncludePattern = (pattern: string) => {
        this.state.update((s) => {
            s.includePattern = pattern;
        });
        if (this.state.get().query.trim()) {
            this.sendSearchDebounced();
        }
    };

    setExcludePattern = (pattern: string) => {
        this.state.update((s) => {
            s.excludePattern = pattern;
        });
        if (this.state.get().query.trim()) {
            this.sendSearchDebounced();
        }
    };

    toggleSearchOpen = () => {
        const isOpen = this.state.get().searchOpen;
        if (isOpen) {
            // Closing search panel — clear everything
            this.clearSearch();
            this.state.update((s) => {
                s.searchOpen = false;
            });
        } else {
            this.state.update((s) => {
                s.searchOpen = true;
            });
        }
    };

    toggleFilters = () => {
        this.state.update((s) => {
            s.showFilters = !s.showFilters;
        });
    };

    /** Trigger search immediately (e.g., on Enter press) */
    triggerSearch = () => {
        if (this.state.get().query.trim()) {
            this.sendSearch();
        }
    };

    clearSearch = () => {
        this.cancelSearch();
        this.state.update((s) => {
            s.query = "";
            s.includePattern = "";
            s.excludePattern = "";
            s.isSearching = false;
            s.results = [];
            s.totalMatches = 0;
            s.totalFiles = 0;
            s.filesSearched = 0;
        });
    };

    private cancelSearch = () => {
        if (this.currentSearchId) {
            ipcRenderer.send(SearchChannel.cancel);
            this.currentSearchId = null;
            this.state.update((s) => {
                s.isSearching = false;
            });
        }
    };

    /** Whether a search is active (has query and results, even if not currently searching) */
    get hasActiveSearch(): boolean {
        const { query, results } = this.state.get();
        return query.trim().length > 0 && results.length > 0;
    }

    /** Get set of matching file paths (for FileExplorer filtering) */
    get matchingFilePaths(): Set<string> {
        const { results } = this.state.get();
        return new Set(results.map((r) => r.filePath));
    }

    dispose = () => {
        this.cancelSearch();
        this.ipcListeners.forEach(({ channel, handler }) => {
            ipcRenderer.removeListener(channel, handler);
        });
        this.ipcListeners = [];
    };
}
