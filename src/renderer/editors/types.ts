import { IPage, PageEditor, PageType } from "../../shared/types";
import { PageModel } from "./base";

export type FileEditorPage<T extends PageModel = PageModel> = React.ComponentType<{
    model: T;
}>;

export interface EditorModelCreations {
    newPageModel(filePath?: string): Promise<PageModel>;
    newEmptyPageModel(pageType: PageType): Promise<PageModel | null>;
    newPageModelFromState(state: Partial<IPage>): Promise<PageModel>;
}

export interface EditorPageModule {
    Editor: FileEditorPage;
}

export type EditorModule = EditorPageModule & EditorModelCreations;

/**
 * Editor category distinguishes between two types of editors:
 *
 * - "page-editor": Standalone editors with their own PageModel (e.g., PDF viewer, Image viewer).
 *   These render instead of TextPageView and handle their own UI entirely.
 *
 * - "content-view": Views of text-based content that share TextFileModel (e.g., Monaco, Grid, Markdown).
 *   These render inside TextPageView via ActiveEditor and share toolbar, script panel, footer.
 *   Content views can switch between each other (e.g., JSON text → Grid view).
 */
export type EditorCategory = "page-editor" | "content-view";

export interface EditorDefinition {
    id: PageEditor;
    name: string;
    pageType: PageType;
    /** Distinguishes standalone page editors from content views */
    category: EditorCategory;
    extensions?: string[];
    filenamePatterns?: RegExp[];
    /** Language IDs this editor supports (for content-view switching) */
    languageIds?: string[];
    priority: number;
    /** Alternative editors for switching (only applies to content-view) */
    alternativeEditors?: PageEditor[];
    loadModule: () => Promise<EditorModule>;
}
