import { IPage, PageType } from "../../shared/types";
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
