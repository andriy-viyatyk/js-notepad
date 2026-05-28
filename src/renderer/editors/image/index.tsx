import { TComponentState } from "../../core/state/state";
import { ImageEditor, getDefaultImageEditorState } from "./ImageEditor";
import { ImageView } from "./ImageView";
import type { EditorModule } from "../base/editorRegistry";
import type { EditorModel } from "../base/EditorModel";

function ImageEditorComponent({ model }: { model: EditorModel }) {
    return <ImageView model={model as ImageEditor} />;
}

export const imageModule: EditorModule = {
    createEditor: () =>
        new ImageEditor(new TComponentState(getDefaultImageEditorState())),
    Component: ImageEditorComponent,
};

export { ImageEditor, getDefaultImageEditorState };
export type { ImageEditorState } from "./ImageEditor";
export { ImageEditor as ImageEditorModel } from "./ImageEditor";
export type { ImageEditorState as ImageEditorModelState } from "./ImageEditor";
// Legacy EditorModule default-export — consumed by the legacy
// safety-net path) AND by `openImageInNewTab` for the blob-URL flow.
// Re-exported as BOTH the named `imageEditorModule` (for direct callers)
// AND as `default` (for the legacy `imgModule.default` consumption in
// `PagesLifecycleModel.openImageInNewTab`).
export { default as imageEditorModule, default } from "./ImageView";
