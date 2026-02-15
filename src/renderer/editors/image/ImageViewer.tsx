import { useRef } from "react";
import { IPage, PageType } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../base";
import { PageToolbar } from "../base/EditorToolbar";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import { FileIcon } from "../../features/sidebar/FileIcon";
import { Button } from "../../components/basic/Button";
import { FlexSpace } from "../../components/layout/Elements";
import { CopyIcon, NavPanelIcon } from "../../theme/icons";
import { NavPanelModel } from "../../features/navigation/nav-panel-store";
import { BaseImageView } from "./BaseImageView";
import type { BaseImageViewRef } from "./BaseImageView";
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

    async restore() {
        await super.restore();
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
    const imageRef = useRef<BaseImageViewRef>(null);
    const src = `safe-file://${filePath?.replace(/\\/g, "/") || ""}`;
    const alt = filePath ? path.basename(filePath) : "Image";

    return (
        <>
            <PageToolbar borderBottom>
                {filePath && (
                    <Button
                        type="icon"
                        size="small"
                        title="File Explorer"
                        onClick={() => {
                            if (model.navPanel) {
                                model.navPanel.toggle();
                            } else {
                                const navPanel = new NavPanelModel(path.dirname(filePath), filePath);
                                navPanel.id = model.id;
                                model.navPanel = navPanel;
                                model.state.update((s) => {
                                    s.hasNavPanel = true;
                                });
                            }
                        }}
                    >
                        <NavPanelIcon />
                    </Button>
                )}
                <FlexSpace />
                <Button
                    type="icon"
                    size="small"
                    title="Copy Image to Clipboard (Ctrl+C)"
                    onClick={() => imageRef.current?.copyToClipboard()}
                >
                    <CopyIcon />
                </Button>
            </PageToolbar>
            <BaseImageView ref={imageRef} src={src} alt={alt} />
        </>
    );
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
