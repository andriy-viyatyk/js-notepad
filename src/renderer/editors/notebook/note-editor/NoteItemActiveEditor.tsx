import { NoteItemEditModel } from "./NoteItemEditModel";
import { MiniTextEditor } from "./MiniTextEditor";
import { AsyncEditor } from "../../../app/AsyncEditor";
import { editorRegistry } from "../../registry";
import { PageEditor } from "../../../../shared/types";
import { TextFileModel } from "../../text/TextPageModel";

// =============================================================================
// Component
// =============================================================================

interface NoteItemActiveEditorProps {
    model: NoteItemEditModel;
}

const getEditorModule = (editor: PageEditor) => async () => {
    const def = editorRegistry.getById(editor);
    if (!def) throw new Error(`Editor "${editor}" not registered`);
    return def.loadModule();
};

/**
 * Renders the active editor for a note item.
 * Uses MiniTextEditor for Monaco, or loads alternative editors via registry.
 */
export function NoteItemActiveEditor({ model }: NoteItemActiveEditorProps) {
    const { editor } = model.state.use((s) => ({
        editor: s.editor,
    }));

    // Use registry to load alternative editors (Grid, Markdown, SVG)
    if (editor && editor !== "monaco") {
        // Cast to TextFileModel for compatibility with existing editors
        // This works because NoteItemEditModel implements the same interface
        return (
            <AsyncEditor
                key={editor}
                getEditorModule={getEditorModule(editor)}
                model={model as unknown as TextFileModel}
                cacheKey={editor}
            />
        );
    }

    // Default to Mini Monaco editor
    return <MiniTextEditor model={model} />;
}
