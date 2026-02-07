export type PageType = "textFile" | "pdfFile" | "imageFile" | "aboutPage";
export type PageEditor = "monaco" | "grid-json" | "grid-csv" | "md-view" | "pdf-view" | "image-view" | "svg-view" | "about-view" | "notebook-view";

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