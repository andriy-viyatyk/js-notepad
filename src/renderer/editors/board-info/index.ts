import { TComponentState } from "../../core/state/state";
import {
    BoardInfoEditorModel,
    getDefaultBoardInfoEditorState,
} from "./BoardInfoEditorModel";
import { BoardInfoEditorView } from "./BoardInfoEditorView";
import type { EditorModule } from "../base/editorRegistry";

export const boardInfoModule: EditorModule = {
    createEditor: () =>
        new BoardInfoEditorModel(new TComponentState(getDefaultBoardInfoEditorState())),
    View: BoardInfoEditorView,
};

export { BoardInfoEditorModel, getDefaultBoardInfoEditorState } from "./BoardInfoEditorModel";
export type { BoardInfoEditorState } from "./BoardInfoEditorModel";
