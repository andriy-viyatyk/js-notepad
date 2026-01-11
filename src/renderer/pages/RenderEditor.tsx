import { useEffect, useState } from "react";
import { EditorModule } from "../custom-editors/types";
import { PageModel } from "../model/page-model";
import { TextFilePage } from "./text-file-page/TextFilePage";
import { TextFileModel } from "./text-file-page/TextFilePage.model";

interface AsyncEditorProps {
    getEditorModule: () => Promise<EditorModule>;
    model: PageModel;
}

function AsyncEditor({getEditorModule, model}: AsyncEditorProps) {
    const [EditorModule, setEditorModule] = useState<EditorModule | null>(null);

    useEffect(() => {
        getEditorModule().then(setEditorModule);
    }, [getEditorModule]);

    if (!EditorModule) {
        return null; // or a loading indicator
    }

    return <EditorModule.Editor model={model} />;
}

const getPdfModule = async () => (await import("../custom-editors/pdf-page/PdfPage")).default;

export function RenderEditor({
    model,
}: {
    model: PageModel;
}) {
    const { type } = model.state.get();
    switch (type) {
        case "textFile":
            return (
                <TextFilePage
                    model={model as TextFileModel}
                />
            );
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