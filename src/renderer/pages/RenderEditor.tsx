import { useEffect, useState } from "react";
import { EditorPageModule } from "../custom-editors/types";
import { PageModel } from "../model/page-model";
import { TextFilePage } from "./text-file-page/TextFilePage";
import { TextFileModel } from "./text-file-page/TextFilePage.model";

interface AsyncEditorProps {
    getEditorModule: () => Promise<EditorPageModule>;
    model: PageModel;
}

function AsyncEditor({getEditorModule, model}: AsyncEditorProps) {
    const [EditorModule, setEditorModule] = useState<EditorPageModule | null>(null);

    useEffect(() => {
        getEditorModule().then(setEditorModule);
    }, [getEditorModule]);

    if (!EditorModule) {
        return null; // or a loading indicator
    }

    return <EditorModule.Editor model={model} />;
}

const getPdfModule = async () => (await import("../custom-editors/pdf-page/PdfPage")).default;
const getGridJsonModule = async () => (await import("../custom-editors/grid/GridJsonPage")).default;

export function RenderEditor({
    model,
}: {
    model: PageModel;
}) {
    const { type, editor } = model.state.use(s => ({
        type: s.type,
        editor: s.editor,
    }));

    switch (type) {
        case "textFile":
            switch (editor) {
                case "grid-json":
                    return (
                        <AsyncEditor
                            getEditorModule={getGridJsonModule}
                            model={model}
                        />
                    );
                case "monaco":
                default:
                    return (
                        <TextFilePage
                            model={model as TextFileModel}
                        />
                    );
            }
        case "pdfFile": {
            return (
                <AsyncEditor
                    getEditorModule={getPdfModule}
                    model={model}
                />
            );
        }
    }
}