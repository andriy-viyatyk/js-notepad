import { PageModel } from "../editors/base";
import { TextPageView, TextFileModel } from "../editors/text";
import { AsyncEditor } from "./AsyncEditor";

const getPdfModule = async () =>
    (await import("../editors/pdf/PdfViewer")).default;

export function RenderEditor({ model }: { model: PageModel }) {
    const { type } = model.state.use((s) => ({
        type: s.type,
    }));

    switch (type) {
        case "textFile":
            return <TextPageView model={model as TextFileModel} />;
        case "pdfFile": {
            return <AsyncEditor getEditorModule={getPdfModule} model={model} />;
        }
    }
}
