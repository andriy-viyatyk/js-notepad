import { TComponentState } from "../../core/state/state";
import {
    StorybookEditorModel,
    getDefaultStorybookEditorState,
} from "./StorybookEditorModel";
import { StorybookEditorView } from "./StorybookEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-575 — native Storybook editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor` when the
 * page's `mainEditorInstance` is a v4-native StorybookEditorModel instance.
 *
 * Storybook is NO-HOST (no `CONTENT_HOST_TRAIT`) and standalone (no file
 * acceptance) — `Component` is the full gallery. No `<TextChrome>` wrap.
 */

function StorybookEditorComponent({ model }: { model: EditorModel }) {
    return <StorybookEditorView model={model as StorybookEditorModel} />;
}

export const storybookModule: EditorModule = {
    createEditor: () =>
        new StorybookEditorModel(new TComponentState(getDefaultStorybookEditorState())),
    Component: StorybookEditorComponent,
};

export {
    StorybookEditorModel,
    getDefaultStorybookEditorState,
    STORYBOOK_PAGE_ID,
} from "./StorybookEditorModel";
export type { StorybookEditorState, PreviewBackground } from "./StorybookEditorModel";
// Legacy EditorModule default-export — consumed by `showStorybookPage` and the
// legacy `editorRegistry` `loadModule` safety-net.
export { default as storybookEditorModule, default } from "./StorybookEditorView";
