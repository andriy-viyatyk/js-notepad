import { useEffect, useState } from "react";
import { EditorModule } from "../custom-editors/types";
import { PageModel } from "../model/page-model";
import { TextFilePage } from "./text-file-page/TextFilePage";
import { TextFileModel } from "./text-file-page/TextFilePage.model";

interface AsyncEditorProps {
    getEditorModule: () => Promise<EditorModule>;
    model: PageModel;
    isActive: boolean;
}

function AsyncEditor({getEditorModule, model, isActive}: AsyncEditorProps) {
    const [EditorModule, setEditorModule] = useState<EditorModule | null>(null);

    useEffect(() => {
        getEditorModule().then(setEditorModule);
    }, [getEditorModule]);

    if (!EditorModule) {
        return null; // or a loading indicator
    }

    return <EditorModule.Editor model={model} isActive={isActive} />;
}

const getPdfModule = async () => (await import("../custom-editors/pdf-page/PdfPage")).default;

export function RenderEditor({
    model,
    isActive,
}: {
    model: PageModel;
    isActive: boolean;
}) {
    const { id, type } = model.state.get();
    switch (type) {
        case "textFile":
            return (
                <TextFilePage
                    model={model as TextFileModel}
                    isActive={isActive}
                    key={id}
                />
            );
        case "pdfFile": {
            return (
                <AsyncEditor
                    getEditorModule={getPdfModule}
                    model={model}
                    isActive={isActive}
                    key={id}
                />
            );
        }
    }
}