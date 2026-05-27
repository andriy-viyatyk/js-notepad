import { TComponentState } from "../../core/state/state";
import { HtmlEditor, defaultHtmlEditorState } from "./HtmlEditor";
import { HtmlBody } from "./HtmlBody";
import { TextChrome } from "../base/v4/TextChrome";
import type { EditorModule } from "../base/v4/editorRegistry";
import type { EditorModel as V4EditorModel } from "../base/v4/EditorModel";

/**
 * EPIC-028 / US-561 — native HTML preview editor module. Registered with the
 * v4 `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorV4` is a v4-native HtmlEditor instance.
 *
 * No toolbar contributions — Html has no preview-side buttons today (vs Svg's
 * open-draw + copy or Markdown's compact toggle). `<TextChrome>` mounts with
 * the default auto-spacer + switch widget only.
 */

function HtmlEditorView({ model }: { model: V4EditorModel }) {
    const html = model as HtmlEditor;
    return (
        <TextChrome model={model}>
            <HtmlBody model={html} />
        </TextChrome>
    );
}

// US-579 — chrome-free Body for notebook per-note embedding.
function HtmlEmbeddedBody({ model }: { model: V4EditorModel }) {
    return <HtmlBody model={model as HtmlEditor} />;
}

export const htmlModule: EditorModule = {
    createEditor: () =>
        new HtmlEditor(new TComponentState({ ...defaultHtmlEditorState })),
    Component: HtmlEditorView,
    Body: HtmlEmbeddedBody,
};

export { HtmlEditor, defaultHtmlEditorState };
export type { HtmlEditorState, HtmlQueueEvent } from "./HtmlEditor";
