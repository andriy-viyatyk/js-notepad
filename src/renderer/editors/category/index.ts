import { TComponentState } from "../../core/state/state";
import {
    CategoryEditorModel,
    getDefaultCategoryEditorModelState,
} from "./CategoryEditorModel";
import { CategoryEditorView } from "./CategoryEditor";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

export const categoryModule: EditorModule = {
    createEditor: () =>
        new CategoryEditorModel(new TComponentState(getDefaultCategoryEditorModelState())),
    View: CategoryEditorView,
    newEditorModel: async (filePath?: string) => {
        const { CategoryEditorModel } = await import("./CategoryEditorModel");
        const { decodeCategoryLink } = await import("../../content/tree-providers/tree-provider-link");
        const model = new CategoryEditorModel();
        if (filePath) {
            const link = decodeCategoryLink(filePath);
            if (link) model.initFromLink(link);
        }
        return model as unknown as EditorModel;
    },
};

export {
    CategoryEditorModel,
    getDefaultCategoryEditorModelState,
} from "./CategoryEditorModel";
export type { CategoryEditorModelState } from "./CategoryEditorModel";
