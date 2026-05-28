import { TComponentState } from "../../core/state/state";
import {
    CategoryEditorModel,
    getDefaultCategoryEditorModelState,
} from "./CategoryEditorModel";
import { CategoryEditor } from "./CategoryEditor";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function CategoryEditorComponent({ model }: { model: EditorModel }) {
    return <CategoryEditor model={model as CategoryEditorModel} />;
}

export const categoryModule: EditorModule = {
    createEditor: () =>
        new CategoryEditorModel(new TComponentState(getDefaultCategoryEditorModelState())),
    Component: CategoryEditorComponent,
};

export {
    CategoryEditorModel,
    getDefaultCategoryEditorModelState,
} from "./CategoryEditorModel";
export type { CategoryEditorModelState } from "./CategoryEditorModel";
// Legacy EditorModule default-export — consumed by the legacy `editorRegistry`
// `loadModule` (which imports `./category/CategoryEditor` directly).
export { default as categoryEditorModule, default } from "./CategoryEditor";
