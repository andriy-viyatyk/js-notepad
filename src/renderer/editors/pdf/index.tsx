import { TComponentState } from "../../core/state/state";
import { PdfEditor, getDefaultPdfEditorState } from "./PdfEditor";
import { PdfView } from "./PdfView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

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
export { PdfEditor as PdfEditorModel } from "./PdfEditor";
export type { PdfEditorState as PdfEditorModelState } from "./PdfEditor";
// Legacy EditorModule default-export — consumed by the legacy
// safety-net path).
export { default as pdfEditorModule } from "./PdfView";
