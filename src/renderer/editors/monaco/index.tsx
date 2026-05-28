import { TComponentState } from "../../core/state/state";
import { MonacoEditor, defaultMonacoEditorState } from "./MonacoEditor";
import { MonacoBody } from "./MonacoBody";
import { TextChrome } from "../base/TextChrome";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function MonacoEditorView({ model }: { model: EditorModel }) {
    return (
        <TextChrome model={model}>
            <MonacoBody model={model as MonacoEditor} />
        </TextChrome>
    );
}

export const monacoModule: EditorModule = {
    createEditor: () =>
        new MonacoEditor(new TComponentState({ ...defaultMonacoEditorState })),
    Component: MonacoEditorView,
};

export { MonacoEditor, defaultMonacoEditorState };
export type {
    MonacoEditorState,
    MonacoQueueEvent,
    MonacoQueueRequest,
} from "./MonacoEditor";
