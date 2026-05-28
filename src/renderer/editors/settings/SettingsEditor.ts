import {
    EditorModel,
    type EditorStateBase,
} from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-572 — native v4 Settings page. NO-HOST editor (no
 * `CONTENT_HOST_TRAIT`) — the simplest no-host editor of all: identity-only
 * state, no content host, no toolbar, no nav-panel, no secondary editors, no
 * transient fields, no cache file. The settings UI sections all read/write
 * `app.settings` directly, independent of this model.
 *
 * Closest siblings: PdfEditor (US-568) / ImageEditor (US-569) — same no-host
 * page-mainEditor shape, minus everything they add. Settings is a singleton
 * well-known page (fixed id `SETTINGS_PAGE_ID`), opened only via the
 * `showSettingsPage` menu action (never via `openFile`), so the v4 registry
 * `accepts` predicate returns -1.
 *
 * Design rationale: doc/tasks/US-572-settings-editor-migration/README.md.
 */

export const SETTINGS_PAGE_ID = "settings-page";

export interface SettingsEditorState extends EditorStateBase {
    /** Discriminator — preserved for `deriveEditorId` and pre-US-572 saved
     *  descriptors (SE-IMPL3). `deriveEditorId({type:"settingsPage"})` === "settings-view". */
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
    /** v4 editor identity. Matches the legacy registry id so v4
     *  EditorDescriptor.editorId and pre-US-572 saved descriptors agree. */
    readonly editorId = "settings-view";

    noLanguage = true;
    skipSave = true;

    /** Preserve the legacy `restore()` title-reset for parity (SE-IMPL5). */
    async restore(): Promise<void> {
        await super.restore();
        this.state.update((s) => { s.title = "Settings"; });
    }
}
