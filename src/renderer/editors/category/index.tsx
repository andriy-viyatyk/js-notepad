import { TComponentState } from "../../core/state/state";
import {
    CategoryEditorModel,
    getDefaultCategoryEditorModelState,
} from "./CategoryEditorModel";
import { CategoryEditor } from "./CategoryEditor";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-576 — native Category (Folder View) editor module. Registered
 * with the v4 `editorRegistry` in `register-editors.ts`; consumed by
 * `RenderEditor` when the page's `mainEditorInstance` is a v4-native
 * CategoryEditorModel instance.
 *
 * Category is NO-HOST (no `CONTENT_HOST_TRAIT`) and a tree-provider CONSUMER —
 * it reads a sibling host's `treeProvider` from `page.panelEditors`. It owns no
 * `treeProvider` and contributes no panel. No `<TextChrome>` wrap.
 */

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
