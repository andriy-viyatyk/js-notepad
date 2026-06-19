import { TComponentState } from "../../core/state/state";
import { BoardEditorModel, getDefaultBoardEditorState } from "./BoardEditorModel";
import { BoardEditorView } from "./BoardEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function BoardEditorComponent({ model }: { model: EditorModel }) {
    return <BoardEditorView model={model as BoardEditorModel} />;
}

export const boardModule: EditorModule = {
    createEditor: () =>
        new BoardEditorModel(new TComponentState(getDefaultBoardEditorState())),
    Component: BoardEditorComponent,
};

export { BoardEditorModel, getDefaultBoardEditorState } from "./BoardEditorModel";
export type { BoardEditorState } from "./BoardEditorModel";
// Legacy EditorModule default-export — consumed by `buildEditorById`
// (navigatePageTo path) and the registry `loadModule` safety-net.
export { default } from "./BoardEditorView";
