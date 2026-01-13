import { PageModel } from "../model/page-model";
import { TextFilePage } from "./text-file-page/TextFilePage";
import { TextFileModel } from "./text-file-page/TextFilePage.model";
import { AsyncEditor } from "./AsyncEditor";

const getPdfModule = async () =>
    (await import("../custom-editors/pdf-page/PdfPage")).default;

export function RenderEditor({ model }: { model: PageModel }) {
    const { type } = model.state.use((s) => ({
        type: s.type,
    }));

    switch (type) {
        case "textFile":
            return <TextFilePage model={model as TextFileModel} />;
        case "pdfFile": {
            return <AsyncEditor getEditorModule={getPdfModule} model={model} />;
        }
    }
}
