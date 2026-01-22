export type PageType = "textFile" | "pdfFile";
export type PageEditor = "monaco" | "grid-json" | "grid-csv" | "md-view";

export interface IPage {
    id: string,
    type: PageType,
    title: string,
    modified: boolean,
    language?: string,
    filePath?: string,
    editor?: PageEditor,
}

export interface WindowState {
    pages: Partial<IPage>[];
    groupings?: [string, string][];
    activePageId?: string;
}

export interface WindowPages {
    pages: Partial<IPage>[];
    windowIndex: number;
}

export interface PageDragData {
    sourceWindowIndex?: number;
    targetWindowIndex?: number;
    page?: Partial<IPage>;
    dropPosition?: { x: number; y: number };
}

export interface FileStats {
    size: number;
    mtime: number;
    exists: boolean;
}