import { TComponentState } from "../../core/state/state";
import { AboutEditor, getDefaultAboutEditorState } from "./AboutEditor";
import { AboutView } from "./AboutView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function AboutEditorComponent({ model }: { model: EditorModel }) {
    return <AboutView model={model as AboutEditor} />;
}

export const aboutModule: EditorModule = {
    createEditor: () =>
        new AboutEditor(new TComponentState(getDefaultAboutEditorState())),
    Component: AboutEditorComponent,
};

export { AboutEditor, getDefaultAboutEditorState, ABOUT_PAGE_ID } from "./AboutEditor";
export type { AboutEditorState } from "./AboutEditor";
export { AboutEditor as AboutEditorModel } from "./AboutEditor";
export type { AboutEditorState as AboutEditorModelState } from "./AboutEditor";
// Legacy EditorModule default-export — consumed by `showAboutPage` and the
// legacy `editorRegistry` `loadModule` safety-net.
export { default as aboutEditorModule, default } from "./AboutView";
