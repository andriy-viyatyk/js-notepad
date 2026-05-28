import { useMemo } from "react";
import { EditorOrHost } from "../../editors/base";
import { editorRegistry as v4EditorRegistry } from "../../editors/base";
import type { EditorModel } from "../../editors/base/EditorModel";
import { AsyncEditor } from "./AsyncEditor";
import type { EditorViewModule, FileEditorComponent } from "../../editors/types";

export function RenderEditor({ model }: { model: EditorModel }) {
    return <NativeEditor model={model} />;
}

const getV4EditorModule = (editorId: string) => async (): Promise<EditorViewModule> => {
    const def = v4EditorRegistry.getById(editorId);
    if (!def) throw new Error(`No v4 editor registered for id: ${editorId}`);
    const module = await def.loadModule();
    // AsyncEditor's EditorViewModule.Editor is typed for the legacy model
    // shape (IContentHost | legacy EditorModel). At runtime we pass our v4
    // editor through unchanged — both shapes share the `model` prop.
    return {
        Editor: module.Component as unknown as FileEditorComponent,
    };
};

function NativeEditor({ model }: { model: EditorModel }) {
    const editorId = model.editorId;
    const loader = useMemo(() => getV4EditorModule(editorId), [editorId]);
    return (
        <AsyncEditor
            getEditorModule={loader}
            model={model as unknown as EditorOrHost}
            cacheKey={`v4:${editorId}`}
        />
    );
}
