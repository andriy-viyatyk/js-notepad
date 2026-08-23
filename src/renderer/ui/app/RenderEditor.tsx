import type React from "react";
import { mountVanilla } from "../../uikit/shared/mount";
import type { EditorModel } from "../../editors/base/EditorModel";
import { RenderEditorView } from "./RenderEditorView";

export function RenderEditor({ model }: { model: EditorModel }): React.ReactElement {
    return mountVanilla(RenderEditorView, { model });
}
