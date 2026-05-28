import { TComponentState } from "../../core/state/state";
import { PdfEditor, getDefaultPdfEditorState } from "./PdfEditor";
import { PdfView } from "./PdfView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

/**
 * EPIC-028 / US-568 — native PDF editor module. Registered with the v4
 * `editorRegistry` in `register-editors.ts`; consumed by `RenderEditor`
 * when the page's `mainEditorInstance` is a v4-native PdfEditor instance.
 *
 * PDF is NO-HOST (no `CONTENT_HOST_TRAIT`) — `Component` is the full PDF
 * viewer (toolbar + pdf.js `<object>` mount). No `<TextChrome>` wrap
 * (text-bearing chrome is irrelevant).
 */

function PdfEditorComponent({ model }: { model: EditorModel }) {
    return <PdfView model={model as PdfEditor} />;
}

export const pdfModule: EditorModule = {
    createEditor: () =>
        new PdfEditor(new TComponentState(getDefaultPdfEditorState())),
    Component: PdfEditorComponent,
};

export { PdfEditor, getDefaultPdfEditorState };
export type { PdfEditorState } from "./PdfEditor";
// Compatibility aliases — retire under US-559 cleanup. Keep
// `PdfEditorModel` / `PdfEditorModelState` names usable from any stale
// imports outside this folder (mirrors US-567 Explorer migration's
// alias pattern).
export { PdfEditor as PdfEditorModel } from "./PdfEditor";
export type { PdfEditorState as PdfEditorModelState } from "./PdfEditor";
// Legacy EditorModule default-export — consumed by the legacy
// `editorRegistry` `loadModule` callback (file-open + LegacyEditorAdapter
// safety-net path).
export { default as pdfEditorModule } from "./PdfView";
