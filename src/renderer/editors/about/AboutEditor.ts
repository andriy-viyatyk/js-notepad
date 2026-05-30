import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";

export const ABOUT_PAGE_ID = "about-page";

export interface AboutEditorState extends EditorStateBase {
    /** State-type discriminator. */
    type: "aboutPage";
}

export const getDefaultAboutEditorState = (): AboutEditorState => ({
    id: ABOUT_PAGE_ID,
    title: "About",
    modified: false,
    type: "aboutPage",
    editor: "about-view",
});

export class AboutEditor extends EditorModel<AboutEditorState> {
    /** Editor identity. Matches `EditorDescriptor.editorId`. */
    readonly editorId = "about-view";

    noLanguage = true;
    skipSave = true;

    /** Preserve the legacy `restore()` title-reset for parity. */
    async restore(): Promise<void> {
        await super.restore();
        this.state.update((s) => { s.title = "About"; });
    }
}
