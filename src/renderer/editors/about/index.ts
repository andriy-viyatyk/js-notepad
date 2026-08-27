import { TComponentState } from "../../core/state/state";
import { AboutEditor, getDefaultAboutEditorState } from "./AboutEditor";
import { AboutEditorView } from "./AboutView";
import type { EditorModule } from "../base/editorRegistry";

export const aboutModule: EditorModule = {
    createEditor: () =>
        new AboutEditor(new TComponentState(getDefaultAboutEditorState())),
    View: AboutEditorView,
};

export { AboutEditor, getDefaultAboutEditorState, ABOUT_PAGE_ID } from "./AboutEditor";
export type { AboutEditorState } from "./AboutEditor";
export { AboutEditor as AboutEditorModel } from "./AboutEditor";
export type { AboutEditorState as AboutEditorModelState } from "./AboutEditor";
