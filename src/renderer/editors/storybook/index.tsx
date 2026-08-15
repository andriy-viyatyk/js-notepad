import { TComponentState } from "../../core/state/state";
import {
    StorybookEditorModel,
    getDefaultStorybookEditorState,
} from "./StorybookEditorModel";
import { StorybookEditorView } from "./StorybookEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function StorybookEditorComponent({ model }: { model: EditorModel }) {
    return <StorybookEditorView model={model as StorybookEditorModel} />;
}

export const storybookModule: EditorModule = {
    createEditor: () =>
        new StorybookEditorModel(new TComponentState(getDefaultStorybookEditorState())),
    Component: StorybookEditorComponent,
};

export {
    StorybookEditorModel,
    getDefaultStorybookEditorState,
    STORYBOOK_PAGE_ID,
} from "./StorybookEditorModel";
export type { StorybookEditorState, PreviewBackground } from "./StorybookEditorModel";
