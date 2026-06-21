import { TComponentState } from "../../core/state/state";
import { decodePersephoneFolderLink } from "../../content/persephone-folder-link";
import { decodePersephoneBoardLink } from "../../content/persephone-board-link";
import {
    BoardEditorModel,
    getDefaultBoardEditorState,
    type BoardEditorState,
} from "./BoardEditorModel";
import { BoardEditorView } from "./BoardEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import type { EditorModule as LegacyEditorModule } from "../types";
import type { EditorOrHost } from "../base";
import type { EditorType, IEditorState } from "../../../shared/types";

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

// =============================================================================
// Legacy EditorModule default export — consumed by `buildEditorById`
// (navigatePageTo path) and the registry `loadModule` safety-net / session
// restore. Kept here (not in BoardEditorView.tsx) so the view file holds only
// the component (one component per file).
// =============================================================================

const boardEditorModule: LegacyEditorModule = {
    Editor: BoardEditorView as unknown as LegacyEditorModule["Editor"],

    newEditorModel: async (filePath?: string) => {
        const model = new BoardEditorModel(new TComponentState(getDefaultBoardEditorState()));
        if (filePath) {
            // Single-board mode (US-748) takes priority — its own root path.
            const boardLink = decodePersephoneBoardLink(filePath);
            if (boardLink) {
                model.initFromBoardRoot(boardLink.boardRoot);
            } else {
                // Project / grouping mode — a .persephone folder.
                const folderLink = decodePersephoneFolderLink(filePath);
                if (folderLink) model.initFromPersephone(folderLink.persephonePath);
            }
        }
        return model as unknown as EditorOrHost;
    },

    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "boardPage") return null;
        return new BoardEditorModel(
            new TComponentState(getDefaultBoardEditorState()),
        ) as unknown as EditorOrHost;
    },

    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const model = new BoardEditorModel(
            new TComponentState({
                ...getDefaultBoardEditorState(),
                ...(state as Partial<BoardEditorState>),
            }),
        );
        // Session restore: boardsDir / boardRoot ride the persisted state — re-init.
        await model.restore();
        return model as unknown as EditorOrHost;
    },
};

export default boardEditorModule;
