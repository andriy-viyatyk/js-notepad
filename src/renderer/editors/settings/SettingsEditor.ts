import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";

export const SETTINGS_PAGE_ID = "settings-page";

export interface SettingsEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "settingsPage";
}

export const getDefaultSettingsEditorState = (): SettingsEditorState => ({
    id: SETTINGS_PAGE_ID,
    title: "Settings",
    modified: false,
    type: "settingsPage",
    editor: "settings-view",
});

export class SettingsEditor extends EditorModel<SettingsEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "settings-view";

    noLanguage = true;
    skipSave = true;
    showBackgroundOrnament = true;

    /** Preserve the legacy `restore()` title-reset for parity. */
    async restore(): Promise<void> {
        await super.restore();
        this.state.update((s) => { s.title = "Settings"; });
    }
}
