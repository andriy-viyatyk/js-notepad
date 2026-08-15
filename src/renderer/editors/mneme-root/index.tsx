import { TComponentState } from "../../core/state/state";
import {
    MnemeRootEditorModel,
    getDefaultMnemeRootEditorState,
} from "./MnemeRootEditorModel";
import { MnemeRootEditorView } from "./MnemeRootEditorView";
import { decodeMnemeFolderLink } from "../../content/mneme-folder-link";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function MnemeRootEditorComponent({ model }: { model: EditorModel }) {
    return <MnemeRootEditorView model={model as MnemeRootEditorModel} />;
}

export const mnemeRootModule: EditorModule = {
    createEditor: () =>
        new MnemeRootEditorModel(new TComponentState(getDefaultMnemeRootEditorState())),
    Component: MnemeRootEditorComponent,
    newEditorModel: async (filePath?: string) => {
        const model = new MnemeRootEditorModel(
            new TComponentState(getDefaultMnemeRootEditorState()),
        );
        if (filePath) {
            const link = decodeMnemeFolderLink(filePath);
            if (link) model.initFromRootFolder(link.rootFolder);
        }
        return model as unknown as EditorModel;
    },
};

export { MnemeRootEditorModel, getDefaultMnemeRootEditorState } from "./MnemeRootEditorModel";
export type { MnemeRootEditorState } from "./MnemeRootEditorModel";
