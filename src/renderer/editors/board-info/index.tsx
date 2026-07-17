import { TComponentState } from "../../core/state/state";
import {
    BoardInfoEditorModel,
    getDefaultBoardInfoEditorState,
    type BoardInfoEditorState,
} from "./BoardInfoEditorModel";
import { BoardInfoEditorView } from "./BoardInfoEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";
import type { EditorModule as LegacyEditorModule } from "../types";
import type { EditorOrHost } from "../base";
import type { EditorType, IEditorState } from "../../../shared/types";

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

// =============================================================================
// Legacy EditorModule default export — consumed by `buildEditorById`
// (navigatePageTo path) and the registry `loadModule` safety-net. Mirrors
// `toolset/index.tsx`. Session restore of a "+"-opened install goes through the
// host branch in PagesPersistenceModel (the descriptor carries `host`), not here.
// =============================================================================

const boardInfoEditorModule: LegacyEditorModule = {
    Editor: BoardInfoEditorView as unknown as LegacyEditorModule["Editor"],

    newEditorModel: async () => {
        // Board Info is never opened by a file path — it is reached via the "+" switch entry
        // (switchMainEditor) or explicit navigation (hub / toast / Properties, US-867).
        return new BoardInfoEditorModel(
            new TComponentState(getDefaultBoardInfoEditorState()),
        ) as unknown as EditorOrHost;
    },

    newEmptyEditorModel: async (editorType: EditorType) => {
        if (editorType !== "boardInfoPage") return null;
        return new BoardInfoEditorModel(
            new TComponentState(getDefaultBoardInfoEditorState()),
        ) as unknown as EditorOrHost;
    },

    newEditorModelFromState: async (state: Partial<IEditorState>) => {
        const merged = {
            ...getDefaultBoardInfoEditorState(),
            ...(state as Partial<BoardInfoEditorState>),
        };
        const model = new BoardInfoEditorModel(new TComponentState(merged));
        await model.restore();
        return model as unknown as EditorOrHost;
    },
};

export default boardInfoEditorModule;
