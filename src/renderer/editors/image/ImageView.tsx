import { IEditorState, EditorType } from "../../../shared/types";
import type { EditorModel } from "../base";
import { EditorModule } from "../types";
import { PageToolbar } from "../base";
import { TComponentState } from "../../core/state/state";
import { IconButton } from "../../uikit";
import { CopyIcon, SaveIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { BaseImageView } from "../shared/BaseImageView";
import { fpBasename } from "../../core/utils/file-path";
import {
    ImageEditor,
    getDefaultImageEditorState,
    type ImageEditorState,
} from "./ImageEditor";

interface ImageViewProps {
    model: ImageEditor;
}

export function ImageView({ model }: ImageViewProps) {
    const filePath = model.state.use((s) => s.filePath);
    const url = model.state.use((s) => s.url);
    const src = url || "";
    const alt = filePath ? fpBasename(filePath) : "Image";

    const rightActions = (
        <>
            {!filePath && url && (
                <IconButton
                    name="image-save"
                    size="sm"
                    title="Save Image to File"
                    onClick={model.saveImage}
                    icon={<SaveIcon />}
                />
            )}
            <IconButton
                name="image-open-draw"
                size="sm"
                title="Open in Drawing Editor"
                onClick={model.openInDrawingEditor}
                icon={<DrawIcon />}
            />
            <IconButton
                name="image-copy"
                size="sm"
                title="Copy Image to Clipboard (Ctrl+C)"
                onClick={model.copyImageToClipboard}
                icon={<CopyIcon />}
            />
        </>
    );

    return (
        <>
            <PageToolbar
                name="image-toolbar"
                model={model}
                borderBottom
                rightContributions={rightActions}
            />
            <BaseImageView ref={model.setImageRef} src={src} alt={alt} />
        </>
    );
}


const imageEditorModule: EditorModule = {
    Editor: ImageView as unknown as EditorModule["Editor"],
    newEditorModel: async (filePath?: string) => {
        const state: ImageEditorState = {
            ...getDefaultImageEditorState(),
            ...(filePath ? { filePath } : {}),
        };
        return new ImageEditor(
            new TComponentState(state),
        ) as unknown as EditorModel;
    },
    newEmptyEditorModel: async (
        editorType: EditorType,
    ): Promise<EditorModel | null> => {
        if (editorType !== "imageFile") return null;
        return new ImageEditor(
            new TComponentState(getDefaultImageEditorState()),
        ) as unknown as EditorModel;
    },
    newEditorModelFromState: async (
        state: Partial<IEditorState>,
    ): Promise<EditorModel> => {
        const initialState: ImageEditorState = {
            ...getDefaultImageEditorState(),
            ...(state as Partial<ImageEditorState>),
        };
        return new ImageEditor(
            new TComponentState(initialState),
        ) as unknown as EditorModel;
    },
};

export default imageEditorModule;
export { ImageEditor };
export type { ImageViewProps, ImageEditorState };
