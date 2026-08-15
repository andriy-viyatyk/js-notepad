import { TComponentState } from "../../core/state/state";
import {
    ImageEditor,
    getDefaultImageEditorState,
    type ImageEditorState,
} from "./ImageEditor";
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
    newEditorModel: async (filePath?: string) => {
        const state: ImageEditorState = {
            ...getDefaultImageEditorState(),
            ...(filePath ? { filePath } : {}),
        };
        return new ImageEditor(
            new TComponentState(state),
        ) as unknown as EditorModel;
    },
};

export { ImageEditor, getDefaultImageEditorState };
export type { ImageEditorState } from "./ImageEditor";
export { ImageEditor as ImageEditorModel } from "./ImageEditor";
export type { ImageEditorState as ImageEditorModelState } from "./ImageEditor";
