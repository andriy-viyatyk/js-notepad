import { IEditorState, EditorType } from "../../../shared/types";
import type { EditorModel } from "../base";
import { EditorModule } from "../types";
import { PageToolbar } from "../base/v4";
import { Panel } from "../../uikit/Panel";
import { TComponentState } from "../../core/state/state";
import {
    PdfEditor,
    getDefaultPdfEditorState,
    type PdfEditorState,
} from "./PdfEditor";

interface PdfViewProps {
    model: PdfEditor;
}

export function PdfView({ model }: PdfViewProps) {
    const localPdfPath = model.state.use((s) => s.localPdfPath);

    const fileUrl = localPdfPath
        ? `safe-file://${localPdfPath.replace(/\\/g, "/")}`
        : "";
    const viewerUrl = fileUrl
        ? `app-asset://pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}`
        : "";

    return (
        <>
            <PageToolbar name="pdf-toolbar" model={model} borderBottom />
            <Panel name="pdf-viewer-root" direction="column" flex={1} overflow="hidden">
                {viewerUrl && (
                    <object
                        data={viewerUrl}
                        style={{ width: "100%", height: "100%", border: "none" }}
                        type="text/html"
                    />
                )}
            </Panel>
        </>
    );
}

// ============================================================================
// EditorModule
// ============================================================================
// EPIC-028 / US-568 — legacy EditorModule shape preserved for the
// LegacyEditorAdapter safety-net path used by `PagesLifecycleModel.openFile`
// (file-open flow). The `as unknown as EditorModel` casts bridge the v4
// PdfEditor class to the legacy EditorModel typing the legacy module
// factories expect; the runtime instance is the v4 class either way.
// Mirrors the US-558 Browser pattern at `browser/BrowserView.tsx`.
// `wrapLegacyForPage`'s `instanceof V4EditorModel` early-return (PD-IMPL16)
// detects the v4 instance and skips the adapter wrap. US-559 retires this
// block entirely.

const pdfEditorModule: EditorModule = {
    Editor: PdfView as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const state: PdfEditorState = {
            ...getDefaultPdfEditorState(),
            ...(filePath ? { filePath } : {}),
        };
        return new PdfEditor(
            new TComponentState(state),
        ) as unknown as EditorModel;
    },
    newEmptyEditorModel: async (
        editorType: EditorType,
    ): Promise<EditorModel | null> => {
        if (editorType !== "pdfFile") return null;
        return new PdfEditor(
            new TComponentState(getDefaultPdfEditorState()),
        ) as unknown as EditorModel;
    },
    newEditorModelFromState: async (
        state: Partial<IEditorState>,
    ): Promise<EditorModel> => {
        const initialState: PdfEditorState = {
            ...getDefaultPdfEditorState(),
            ...(state as Partial<PdfEditorState>),
        };
        return new PdfEditor(
            new TComponentState(initialState),
        ) as unknown as EditorModel;
    },
};

export default pdfEditorModule;
export { PdfEditor };
export type { PdfViewProps, PdfEditorState };
