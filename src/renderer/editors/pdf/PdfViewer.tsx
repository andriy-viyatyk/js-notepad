import styled from "@emotion/styled";
import { IPage, PageType } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../base";
import { PageToolbar } from "../base/EditorToolbar";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import { FileIcon } from "../../features/sidebar/FileIcon";
import { Button } from "../../components/basic/Button";
import { FlexSpace } from "../../components/layout/Elements";
import { NavPanelIcon } from "../../theme/icons";
import { NavPanelModel } from "../../features/navigation/nav-panel-store";
const path = require("path");

const PdfViewerRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    position: "relative",
});

interface PdfViewerModelState extends IPage {}

const getDefaultPdfViewerModelState = (): PdfViewerModelState => ({
    ...getDefaultPageModelState(),
    type: "pdfFile" as const,
});

class PdfViewerModel extends PageModel<PdfViewerModelState, void> {
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

interface PdfViewerProps {
    model: PdfViewerModel;
}

function PdfViewer({ model }: PdfViewerProps) {
    const filePath = model.state.use((s) => s.filePath);
    const fileUrl = `safe-file://${filePath.replace(/\\/g, "/")}`;

    const viewerUrl = `app-asset://pdfjs/web/viewer.html?file=${encodeURIComponent(fileUrl)}`;

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
            </PageToolbar>
            <PdfViewerRoot>
                <object
                    data={viewerUrl}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    type="text/html"
                />
            </PdfViewerRoot>
        </>
    );
}

const pdfEditorModule: EditorModule = {
    Editor: PdfViewer,
    newPageModel: async (filePath?: string) => {
        const state = {
            ...getDefaultPdfViewerModelState(),
            ...(filePath ? { filePath } : {}),
        };

        return new PdfViewerModel(new TComponentState(state));
    },
    newEmptyPageModel: async (
        pageType: PageType
    ): Promise<PageModel | null> => {
        if (pageType === "pdfFile") {
            return new PdfViewerModel(
                new TComponentState(getDefaultPdfViewerModelState())
            );
        }
        return null;
    },
    newPageModelFromState: async (
        state: Partial<IPage>
    ): Promise<PageModel> => {
        const initialState: PdfViewerModelState = {
            ...getDefaultPdfViewerModelState(),
            ...state,
        };
        return new PdfViewerModel(new TComponentState(initialState));
    },
};

export default pdfEditorModule;

// Named exports
export { PdfViewer, PdfViewerModel };
export type { PdfViewerProps, PdfViewerModelState };

// Re-export with old names for backward compatibility
export { PdfViewer as PdfPage };
export { PdfViewerModel as PdfPageModel };
export type { PdfViewerProps as PdfPageProps };
export type { PdfViewerModelState as PdfPageModelState };
