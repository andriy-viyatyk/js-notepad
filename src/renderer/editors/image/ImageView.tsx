import { PageToolbar } from "../base";
import { mountVanilla } from "../../uikit/shared/mount";
import { ImageViewport } from "../../uikit/ImageViewport";
import { fpBasename } from "../../core/utils/file-path";
import { ImageEditor, type ImageEditorState } from "./ImageEditor";
import { ImageToolbarView } from "./ImageToolbarView";

interface ImageViewProps {
    model: ImageEditor;
}

export function ImageView({ model }: ImageViewProps) {
    const filePath = model.state.use((s) => s.filePath);
    const url = model.state.use((s) => s.url);
    const src = url || "";
    const alt = filePath ? fpBasename(filePath) : "Image";

    return (
        <>
            <PageToolbar
                name="image-toolbar"
                model={model}
                borderBottom
                rightContributions={mountVanilla(ImageToolbarView, { model })}
            />
            <ImageViewport onModel={model.setImageModel} src={src} alt={alt} />
        </>
    );
}

export { ImageEditor };
export type { ImageViewProps, ImageEditorState };
