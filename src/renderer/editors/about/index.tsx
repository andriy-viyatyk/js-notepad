import { TComponentState } from "../../core/state/state";
import { AboutEditor, getDefaultAboutEditorState } from "./AboutEditor";
import { AboutView } from "./AboutView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-573 — native About editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when
 * the page's `mainEditorInstance` is a v4-native AboutEditor instance.
 *
 * About is NO-HOST (no `CONTENT_HOST_TRAIT`) and standalone (no file
 * acceptance) — `Component` is the full About page. No `<TextChrome>` wrap.
 */

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
// Compatibility aliases — retire under US-559. Keep the legacy
// `AboutEditorModel` / `AboutEditorModelState` names usable from any stale
// imports (mirrors US-568/569/571/572).
export { AboutEditor as AboutEditorModel } from "./AboutEditor";
export type { AboutEditorState as AboutEditorModelState } from "./AboutEditor";
// Legacy EditorModule default-export — consumed by `showAboutPage` and the
// legacy `editorRegistry` `loadModule` safety-net.
export { default as aboutEditorModule, default } from "./AboutView";
