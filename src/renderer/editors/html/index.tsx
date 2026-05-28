import { TComponentState } from "../../core/state/state";
import { HtmlEditor, defaultHtmlEditorState } from "./HtmlEditor";
import { HtmlBody } from "./HtmlBody";
import { TextChrome } from "../base/TextChrome";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function HtmlEditorView({ model }: { model: EditorModel }) {
    const html = model as HtmlEditor;
    return (
        <TextChrome model={model}>
            <HtmlBody model={html} />
        </TextChrome>
    );
}

function HtmlEmbeddedBody({ model }: { model: EditorModel }) {
    return <HtmlBody model={model as HtmlEditor} />;
}

export const htmlModule: EditorModule = {
    createEditor: () =>
        new HtmlEditor(new TComponentState({ ...defaultHtmlEditorState })),
    Component: HtmlEditorView,
    Body: HtmlEmbeddedBody,
};

export { HtmlEditor, defaultHtmlEditorState };
export type { HtmlEditorState, HtmlQueueEvent } from "./HtmlEditor";
