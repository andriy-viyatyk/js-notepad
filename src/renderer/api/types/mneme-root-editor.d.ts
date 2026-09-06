export type MnemeSearchMode = "text" | "vector" | "hybrid";

export interface IMnemeSearchHit {
    readonly uri: string;
    readonly title: string;
    readonly tags: readonly string[];
    readonly snippet: string;
    readonly score: number;
}

export interface IMnemeRootEditor {
    readonly id: "mneme-root";
    readonly name: string;
    readonly rootFolder?: string;
    readonly rootName?: string;
    readonly resolving: boolean;
    readonly error?: string;
    readonly query: string;
    readonly mode: MnemeSearchMode;
    readonly filterTags: readonly string[];
    readonly filterExcludeTags: readonly string[];
    readonly dateFrom?: string;
    readonly dateTo?: string;
    readonly tagVocab?: readonly string[];
    readonly selectedDocumentHref?: string;
    readonly hasSearched: boolean;
    readonly searching: boolean;
    readonly results?: readonly IMnemeSearchHit[];
    readonly searchNote?: string;
    readonly searchError?: string;

    setQuery(query: string): void;
    setMode(mode: MnemeSearchMode): void;
    setFilterTags(tags: string[]): void;
    setExcludeTags(tags: string[]): void;
    setDateFrom(date: string): void;
    setDateTo(date: string): void;
    clearFilters(): void;
    runSearch(): Promise<void>;
}
