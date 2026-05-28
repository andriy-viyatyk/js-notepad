import { TComponentState } from "../../core/state/state";
import { SettingsEditor, getDefaultSettingsEditorState } from "./SettingsEditor";
import { SettingsView } from "./SettingsView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-572 — native Settings editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native SettingsEditor instance.
 *
 * Settings is NO-HOST (no `CONTENT_HOST_TRAIT`) and standalone (no file
 * acceptance) — `Component` is the full settings page. No `<TextChrome>` wrap.
 */

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
// Compatibility aliases — retire under US-559. Keep the legacy
// `SettingsEditorModel` / `SettingsEditorModelState` names usable from any
// stale imports (mirrors US-568/569/571).
export { SettingsEditor as SettingsEditorModel } from "./SettingsEditor";
export type { SettingsEditorState as SettingsEditorModelState } from "./SettingsEditor";
// Legacy EditorModule default-export — consumed by `showSettingsPage` and the
// legacy `editorRegistry` `loadModule` safety-net.
export { default as settingsEditorModule, default } from "./SettingsView";
