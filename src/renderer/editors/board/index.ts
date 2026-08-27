import { TComponentState } from "../../core/state/state";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
import {
    BoardEditorModel,
    getDefaultBoardEditorState,
} from "./BoardEditorModel";
import { BoardEditorView } from "./BoardEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

export const boardModule: EditorModule = {
    createEditor: () =>
        new BoardEditorModel(new TComponentState(getDefaultBoardEditorState())),
    View: BoardEditorView,
    newEditorModel: async (filePath?: string) => {
        const model = new BoardEditorModel(new TComponentState(getDefaultBoardEditorState()));
        if (filePath) {
            // A board is opened by its own root path (persephone-board:// link, US-748).
            const boardLink = decodePersephoneBoardLink(filePath);
            if (boardLink) model.initFromBoardRoot(boardLink.boardRoot);
        }
        return model as unknown as EditorModel;
    },
};

export { BoardEditorModel, getDefaultBoardEditorState } from "./BoardEditorModel";
export type { BoardEditorState } from "./BoardEditorModel";
