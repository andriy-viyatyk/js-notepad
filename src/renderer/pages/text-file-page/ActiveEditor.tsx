import { ReactNode } from "react";
import { TextFileModel } from "./TextFilePage.model";
import { AsyncEditor } from "../AsyncEditor";
import { TextEditor } from "./TextEditor";

interface ActiveEditorProps {
     model: TextFileModel; 
}

const getGridJsonModule = async () =>
    (await import("../../custom-editors/grid/GridJsonPage")).default;

export function ActiveEditor({ model }: ActiveEditorProps) {
    const editor = model.state.use(s => s.editor);

    let editorComponent: ReactNode = null;
    switch (editor) {
        case "grid-json":
            editorComponent = <AsyncEditor getEditorModule={getGridJsonModule} model={model} />;
            break;
        default:
            editorComponent = <TextEditor model={model} />;
            break;
    }

    return editorComponent;
}