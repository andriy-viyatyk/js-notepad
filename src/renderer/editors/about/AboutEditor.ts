import {
    EditorModel,
    type EditorStateBase,
} from "../base/EditorModel";

/**
 * EPIC-028 / US-573 — native v4 About page. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`). A near-exact clone of `SettingsEditor` (US-572):
 * identity-only state, no content host, no toolbar, no nav-panel, no secondary
 * editors, no transient fields, no cache file. The About view (logo, version,
 * runtime versions, update check, links) owns its own view-local state and is
 * independent of this model.
 *
 * Singleton well-known page (fixed id `ABOUT_PAGE_ID`), opened only via the
 * `showAboutPage` menu action (never via `openFile`), so the v4 registry
 * `accepts` predicate returns -1.
 *
 * Design rationale: doc/tasks/US-573-about-editor-migration/README.md.
 */

export const ABOUT_PAGE_ID = "about-page";

export interface AboutEditorState extends EditorStateBase {
    /** Discriminator — preserved for `deriveEditorId` and pre-US-573 saved
     *  descriptors (AB-IMPL3). `deriveEditorId({type:"aboutPage"})` === "about-view". */
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
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId and pre-US-573 saved descriptors agree. */
    readonly editorId = "about-view";

    noLanguage = true;
    skipSave = true;

    /** Preserve the legacy `restore()` title-reset for parity (AB-IMPL5). */
    async restore(): Promise<void> {
        await super.restore();
        this.state.update((s) => { s.title = "About"; });
    }
}
