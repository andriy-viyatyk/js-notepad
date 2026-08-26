import { TComponentState } from "../../core/state/state";
import {
    StorybookEditorModel,
    getDefaultStorybookEditorState,
} from "./StorybookEditorModel";
import { StorybookEditorView } from "./StorybookEditorView";
import type { EditorModule } from "../base/editorRegistry";

export const storybookModule: EditorModule = {
    createEditor: () =>
        new StorybookEditorModel(new TComponentState(getDefaultStorybookEditorState())),
    View: StorybookEditorView,
};

export {
    StorybookEditorModel,
    getDefaultStorybookEditorState,
    STORYBOOK_PAGE_ID,
} from "./StorybookEditorModel";
export type { StorybookEditorState, PreviewBackground } from "./StorybookEditorModel";
