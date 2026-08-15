import { PageToolbar } from "../base";
import { IconButton } from "../../uikit";
import { WithMenu } from "../../uikit/Menu";
import { CopyIcon, SaveIcon } from "../../theme/icons";
import { DrawIcon } from "../../theme/language-icons";
import { BaseImageView } from "../shared/BaseImageView";
import { fpBasename } from "../../core/utils/file-path";
import { ImageEditor, type ImageEditorState } from "./ImageEditor";

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
            {url && (
                <WithMenu
                    name="image-save-menu"
                    items={[
                        { label: "Save as .png", onClick: () => void model.saveAsPng() },
                        { label: "Save original", onClick: () => void model.saveOriginal() },
                    ]}
                >
                    {(setOpen) => (
                        <IconButton
                            name="image-save"
                            size="sm"
                            title="Save image…"
                            onClick={(e) => setOpen(e.currentTarget)}
                            icon={<SaveIcon />}
                        />
                    )}
                </WithMenu>
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

export { ImageEditor };
export type { ImageViewProps, ImageEditorState };
