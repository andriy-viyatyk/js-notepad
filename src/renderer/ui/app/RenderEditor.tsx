import { useMemo } from "react";
import { EditorModel as LegacyEditorModel } from "../../editors/base";
import { editorRegistry as v4EditorRegistry } from "../../editors/base/v4";
import type { EditorModel as V4EditorModel } from "../../editors/base/v4/EditorModel";
import { AsyncEditor } from "./AsyncEditor";
import type { EditorViewModule, FileEditorComponent } from "../../editors/types";

/**
 * Renders the appropriate editor for a page model (v4 surface).
 *
 * EPIC-028 / US-559 — strangler retirement complete: every page editor is a
 * v4-native EditorModel mounted via its module's `Component`. The legacy
 * `LegacyAdapterEditor` branch + the `TextEditorView` fallback are gone.
 */
export function RenderEditor({ model }: { model: V4EditorModel }) {
    return <V4NativeEditor model={model} />;
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

function V4NativeEditor({ model }: { model: V4EditorModel }) {
    const editorId = model.editorId;
    const loader = useMemo(() => getV4EditorModule(editorId), [editorId]);
    return (
        <AsyncEditor
            getEditorModule={loader}
            model={model as unknown as LegacyEditorModel}
            cacheKey={`v4:${editorId}`}
        />
    );
}
