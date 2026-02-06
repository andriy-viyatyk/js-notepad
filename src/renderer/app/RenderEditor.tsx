import { PageModel } from "../editors/base";
import { TextPageView, TextFileModel } from "../editors/text";
import { editorRegistry } from "../editors/registry";
import { AsyncEditor } from "./AsyncEditor";

const getPdfModule = async () => {
    const def = editorRegistry.getById("pdf-view");
    if (!def) throw new Error("PDF editor not registered");
    return def.loadModule();
};

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
