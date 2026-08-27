import type { FileSearchState } from "./FileSearchModel";

export type { FileSearchState } from "./FileSearchModel";

export interface FileSearchProps {
    /** Root folder to search in. */
    folder: string;
    /** Restored state (query, results, filters). */
    state?: FileSearchState;
    /** Called when state changes (for persistence). */
    onStateChange?: (state: FileSearchState) => void;
    /** Called when user clicks a search result. */
    onResultClick?: (filePath: string, lineNumber?: number) => void;
}
