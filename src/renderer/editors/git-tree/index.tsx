import { TComponentState } from "../../core/state/state";
import { GitTreeEditorModel, getDefaultGitTreeEditorState } from "./GitTreeEditorModel";
import { GitTreeEditorView } from "./GitTreeEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function GitTreeEditorComponent({ model }: { model: EditorModel }) {
    return <GitTreeEditorView model={model as GitTreeEditorModel} />;
}

export const gitTreeModule: EditorModule = {
    createEditor: () =>
        new GitTreeEditorModel(new TComponentState(getDefaultGitTreeEditorState())),
    Component: GitTreeEditorComponent,
};

export { GitTreeEditorModel, getDefaultGitTreeEditorState } from "./GitTreeEditorModel";
export type { GitTreeEditorState } from "./GitTreeEditorModel";
// Legacy EditorModule default-export — consumed by `buildEditorById` and the
// legacy `editorRegistry` `loadModule` safety-net.
export { default as gitTreeEditorModule, default } from "./GitTreeEditorView";
