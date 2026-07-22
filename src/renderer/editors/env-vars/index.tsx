import { TComponentState } from "../../core/state/state";
import { EnvVarsEditor, defaultEnvVarsEditorState } from "./EnvVarsEditor";
import { EnvVarsBody } from "./EnvVarsBody";
import { TextChrome } from "../base/TextChrome";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function EnvVarsEditorView({ model }: { model: EditorModel }) {
    const editor = model as EnvVarsEditor;
    return (
        <TextChrome model={model}>
            <EnvVarsBody model={editor} />
        </TextChrome>
    );
}

export const envVarsModule: EditorModule = {
    createEditor: () =>
        new EnvVarsEditor(new TComponentState({ ...defaultEnvVarsEditorState })),
    Component: EnvVarsEditorView,
};

export { EnvVarsEditor, defaultEnvVarsEditorState };
export type { EnvVarsEditorState } from "./EnvVarsEditor";
