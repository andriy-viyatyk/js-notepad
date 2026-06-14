import { TComponentState } from "../../core/state/state";
import {
    MnemeRootEditorModel,
    getDefaultMnemeRootEditorState,
} from "./MnemeRootEditorModel";
import { MnemeRootEditorView } from "./MnemeRootEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function MnemeRootEditorComponent({ model }: { model: EditorModel }) {
    return <MnemeRootEditorView model={model as MnemeRootEditorModel} />;
}

export const mnemeRootModule: EditorModule = {
    createEditor: () =>
        new MnemeRootEditorModel(new TComponentState(getDefaultMnemeRootEditorState())),
    Component: MnemeRootEditorComponent,
};

export { MnemeRootEditorModel, getDefaultMnemeRootEditorState } from "./MnemeRootEditorModel";
export type { MnemeRootEditorState } from "./MnemeRootEditorModel";
// Legacy EditorModule default-export — consumed by `buildEditorById` and the
// legacy `editorRegistry` `loadModule` safety-net.
export { default } from "./MnemeRootEditorView";
