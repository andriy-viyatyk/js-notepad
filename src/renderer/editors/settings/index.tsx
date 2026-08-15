import { TComponentState } from "../../core/state/state";
import { SettingsEditor, getDefaultSettingsEditorState } from "./SettingsEditor";
import { SettingsView } from "./SettingsView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function SettingsEditorComponent({ model }: { model: EditorModel }) {
    return <SettingsView model={model as SettingsEditor} />;
}

export const settingsModule: EditorModule = {
    createEditor: () =>
        new SettingsEditor(new TComponentState(getDefaultSettingsEditorState())),
    Component: SettingsEditorComponent,
};

export { SettingsEditor, getDefaultSettingsEditorState, SETTINGS_PAGE_ID } from "./SettingsEditor";
export type { SettingsEditorState } from "./SettingsEditor";
export { SettingsEditor as SettingsEditorModel } from "./SettingsEditor";
export type { SettingsEditorState as SettingsEditorModelState } from "./SettingsEditor";
