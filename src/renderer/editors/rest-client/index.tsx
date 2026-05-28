import { TComponentState } from "../../core/state/state";
import { RestClientEditor, defaultRestClientEditorState } from "./RestClientEditor";
import { RestClientBody } from "./RestClientBody";
import { TextChrome } from "../base/TextChrome";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function RestClientEditorView({ model }: { model: EditorModel }) {
    const restClient = model as RestClientEditor;
    return (
        <TextChrome model={model}>
            <RestClientBody model={restClient} />
        </TextChrome>
    );
}

export const restClientModule: EditorModule = {
    createEditor: () =>
        new RestClientEditor(new TComponentState({ ...defaultRestClientEditorState })),
    Component: RestClientEditorView,
};

export { RestClientEditor, defaultRestClientEditorState };
export type { RestClientEditorState, RestClientQueueEvent } from "./RestClientEditor";
