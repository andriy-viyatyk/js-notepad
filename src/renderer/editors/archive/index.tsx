import { TComponentState } from "../../core/state/state";
import { ArchiveEditor, getDefaultArchiveEditorState } from "./ArchiveEditor";
import { ArchiveEditorView, makeArchiveEditor } from "./ArchiveEditorView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function ArchiveEditorComponent({ model }: { model: EditorModel }) {
    return <ArchiveEditorView model={model as ArchiveEditor} />;
}

export const archiveModule: EditorModule = {
    createEditor: () =>
        new ArchiveEditor(new TComponentState(getDefaultArchiveEditorState())),
    Component: ArchiveEditorComponent,
    newEditorModel: async (filePath?: string) => {
        const model = makeArchiveEditor();
        if (filePath) await model.initFromArchive(filePath);
        return model as unknown as EditorModel;
    },
};

export { ArchiveEditor, getDefaultArchiveEditorState };
export type { ArchiveEditorState } from "./ArchiveEditor";
export { ArchiveEditor as ArchiveEditorModel } from "./ArchiveEditor";
export type { ArchiveEditorState as ArchiveEditorModelState } from "./ArchiveEditor";
