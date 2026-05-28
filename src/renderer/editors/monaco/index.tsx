import { TComponentState } from "../../core/state/state";
import { MonacoEditor, defaultMonacoEditorState } from "./MonacoEditor";
import { MonacoBody } from "./MonacoBody";
import { TextChrome } from "../base/v4/TextChrome";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-551 — native Monaco editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native MonacoEditor instance.
 */

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
