import { TComponentState } from "../../core/state/state";
import { BrowserEditor } from "./BrowserEditor";
import { getDefaultBrowserPageState } from "./BrowserEditorModel";
import { BrowserEditorView } from "./BrowserView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function BrowserEditorComponent({ model }: { model: EditorModel }) {
    return <BrowserEditorView model={model as BrowserEditor} />;
}

export const browserModule: EditorModule = {
    createEditor: () =>
        new BrowserEditor(new TComponentState(getDefaultBrowserPageState())),
    Component: BrowserEditorComponent,
};

export { BrowserEditor };
export type { BrowserQueueEvent } from "./BrowserEditor";
export type { BrowserEditorState, BrowserTabData } from "./BrowserEditorModel";
