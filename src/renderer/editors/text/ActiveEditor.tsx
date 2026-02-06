import { TextFileModel } from "./TextPageModel";
import { AsyncEditor } from "../../app/AsyncEditor";
import { TextEditor } from "./TextEditor";
import { editorRegistry } from "../registry";
import { PageEditor } from "../../../shared/types";

interface ActiveEditorProps {
    model: TextFileModel;
}

const getEditorModule = (editor: PageEditor) => async () => {
    const def = editorRegistry.getById(editor);
    if (!def) throw new Error(`Editor "${editor}" not registered`);
    return def.loadModule();
};

export function ActiveEditor({ model }: ActiveEditorProps) {
    const { editor, encripted } = model.state.use((s) => ({
        editor: s.editor,
        encripted: s.encripted,
    }));

    // Always show text editor for encrypted content
    if (encripted) {
        return <TextEditor model={model} />;
    }

    // Use registry to load alternative editors
    if (editor && editor !== "monaco") {
        return (
            <AsyncEditor
                key={editor}
                getEditorModule={getEditorModule(editor)}
                model={model}
            />
        );
    }

    // Default to Monaco text editor
    return <TextEditor model={model} />;
}
