import { ReactNode } from "react";
import { TextFileModel } from "./TextFilePage.model";
import { AsyncEditor } from "../AsyncEditor";
import { TextEditor } from "./TextEditor";

interface ActiveEditorProps {
    model: TextFileModel;
}

const getGridJsonModule = async () =>
    (await import("../../custom-editors/grid/GridPage")).default;
const getMdViewModule = async () =>
    (await import("../../custom-editors/md-view/MdView")).default;

export function ActiveEditor({ model }: ActiveEditorProps) {
    const { editor, encripted } = model.state.use((s) => ({
        editor: s.editor,
        encripted: s.encripted,
    }));

    if (encripted) {
        return <TextEditor model={model} />;
    }

    let editorComponent: ReactNode = null;
    switch (editor) {
        case "grid-json":
        case "grid-csv":
            editorComponent = (
                <AsyncEditor
                    key={editor}
                    getEditorModule={getGridJsonModule}
                    model={model}
                />
            );
            break;
        case "md-view":
            editorComponent = (
                <AsyncEditor
                    key={editor}
                    getEditorModule={getMdViewModule}
                    model={model}
                />
            );
            break;
        default:
            editorComponent = <TextEditor model={model} />;
            break;
    }

    return editorComponent;
}
