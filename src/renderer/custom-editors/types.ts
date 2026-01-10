import { IPage, PageType } from "../../shared/types";
import { PageModel } from "../model/page-model";

export type FileEditorPage<T extends PageModel = PageModel> = React.ComponentType<{
    model: T;
    isActive: boolean;
}>;

export interface EditorModelCreations {
    newPageModel(filePath?: string): Promise<PageModel>;
    newEmptyPageModel(pageType: PageType): Promise<PageModel | null>;
    newPageModelFromState(state: Partial<IPage>): Promise<PageModel>;
}

export interface EditorModule extends EditorModelCreations {
    Editor: FileEditorPage
}