import { useMemo } from "react";
import { type EditorOrHost, editorRegistry } from "../../editors/base";
import type { EditorModel } from "../../editors/base/EditorModel";
import { AsyncEditor } from "./AsyncEditor";
import type { EditorViewModule, FileEditorComponent } from "../../editors/types";

export function RenderEditor({ model }: { model: EditorModel }) {
    return <NativeEditor model={model} />;
}

const getEditorModule = (editorId: string) => async (): Promise<EditorViewModule> => {
    const def = editorRegistry.getById(editorId);
    if (!def) throw new Error(`No editor registered for id: ${editorId}`);
    const module = await def.loadModule();
    // AsyncEditor's EditorViewModule.Editor is typed for IContentHost | EditorModel.
    // At runtime we pass the editor through unchanged — both shapes share the
    // `model` prop.
    return {
        Editor: module.Component as unknown as FileEditorComponent,
    };
};

function NativeEditor({ model }: { model: EditorModel }) {
    const editorId = model.editorId;
    const loader = useMemo(() => getEditorModule(editorId), [editorId]);
    return (
        <AsyncEditor
            getEditorModule={loader}
            model={model as unknown as EditorOrHost}
            cacheKey={editorId}
        />
    );
}
