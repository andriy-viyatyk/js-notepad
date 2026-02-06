import { IPage, PageType } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import { FileIcon } from "../../features/sidebar/FileIcon";
import { BaseImageView } from "./BaseImageView";
const path = require("path");

// ============================================================================
// ImageViewerModel (Page Model) - manages page state and lifecycle
// ============================================================================

interface ImageViewerModelState extends IPage {}

const getDefaultImageViewerModelState = (): ImageViewerModelState => ({
    ...getDefaultPageModelState(),
    type: "imageFile" as const,
});

class ImageViewerModel extends PageModel<ImageViewerModelState, void> {
    noLanguage = true;

    getRestoreData() {
        return JSON.parse(JSON.stringify(this.state.get()));
    }

    async restore() {
        const filePath = this.state.get().filePath;
        if (filePath) {
            this.state.update((s) => {
                s.title = path.basename(filePath);
            });
        }
    }

    getIcon = () => {
        return (
            <FileIcon path={this.state.get().filePath} width={12} height={12} />
        );
    };
}

// ============================================================================
// ImageViewer Component - thin wrapper for binary image files
// ============================================================================

interface ImageViewerProps {
    model: ImageViewerModel;
}

function ImageViewer({ model }: ImageViewerProps) {
    const filePath = model.state.use((s) => s.filePath);
    const src = `safe-file://${filePath?.replace(/\\/g, "/") || ""}`;
    const alt = filePath ? path.basename(filePath) : "Image";

    return <BaseImageView src={src} alt={alt} />;
}

// ============================================================================
// Editor Module
// ============================================================================

const imageEditorModule: EditorModule = {
    Editor: ImageViewer,
    newPageModel: async (filePath?: string) => {
        const state = {
            ...getDefaultImageViewerModelState(),
            ...(filePath ? { filePath } : {}),
        };

        return new ImageViewerModel(new TComponentState(state));
    },
    newEmptyPageModel: async (
        pageType: PageType
    ): Promise<PageModel | null> => {
        if (pageType === "imageFile") {
            return new ImageViewerModel(
                new TComponentState(getDefaultImageViewerModelState())
            );
        }
        return null;
    },
    newPageModelFromState: async (
        state: Partial<IPage>
    ): Promise<PageModel> => {
        const initialState: ImageViewerModelState = {
            ...getDefaultImageViewerModelState(),
            ...state,
        };
        return new ImageViewerModel(new TComponentState(initialState));
    },
};

export default imageEditorModule;

// Named exports
export { ImageViewer, ImageViewerModel };
export type { ImageViewerProps, ImageViewerModelState };

// Re-export base components for reuse
export { BaseImageView, ImageViewModel, defaultImageViewState } from "./BaseImageView";
export type { BaseImageViewProps, ImageViewState } from "./BaseImageView";
