import { TComponentState } from "../../core/state/state";
import {
    BoardInfoEditorModel,
    getDefaultBoardInfoEditorState,
} from "./BoardInfoEditorModel";
import { BoardInfoEditorView } from "./BoardInfoEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function BoardInfoEditorComponent({ model }: { model: EditorModel }) {
    return <BoardInfoEditorView model={model as BoardInfoEditorModel} />;
}

export const boardInfoModule: EditorModule = {
    createEditor: () =>
        new BoardInfoEditorModel(new TComponentState(getDefaultBoardInfoEditorState())),
    Component: BoardInfoEditorComponent,
};

export { BoardInfoEditorModel, getDefaultBoardInfoEditorState } from "./BoardInfoEditorModel";
export type { BoardInfoEditorState } from "./BoardInfoEditorModel";
