import styled from "@emotion/styled";
import { IPage, PageType } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../../model/page-model";
import { TComponentState } from "../../common/classes/state";
import clsx from "clsx";
import { EditorModule } from "../types";
import { FileIcon } from "../../pages/menu-bar/FileIcon";
const path = require("path");

const PdvPageRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    height: 200,
    position: "relative",
    "&:not(.isActive)": {
        display: "none",
    },
});

interface PdfPageModelState extends IPage {}

const getDefaultPdfPageModelState = (): PdfPageModelState => ({
    ...getDefaultPageModelState(),
    type: "pdfFile" as const,
});

class PdfPageModel extends PageModel<PdfPageModelState, void> {
    noLanguage = true;

    getRestoreData() {
        return this.state.get();
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
        console.log("icon file path:", this.state.get().filePath);
        return <FileIcon path={this.state.get().filePath} width={12} height={12} />;
    };
}

interface PdfPageProps {
    model: PdfPageModel;
    isActive: boolean;
}

function PdfPage({ model, isActive }: PdfPageProps) {
    const filePath = model.state.use((s) => s.filePath);
    const fileUrl = `safe-file://${filePath.replace(/\\/g, "/")}`;

    return (
        <PdvPageRoot className={clsx({ isActive })}>
            <webview
                src={fileUrl}
                style={{ width: "100%", height: "100%" }}
                partition="persist:file-access"
            />
        </PdvPageRoot>
    );
}

const pdfEditorModule: EditorModule = {
    Editor: PdfPage,
    newPageModel: async (filePath?: string) => {
        const state = {
            ...getDefaultPdfPageModelState(),
            ...(filePath ? { filePath } : {}),
        };

        return new PdfPageModel(new TComponentState(state));
    },
    newEmptyPageModel: async (
        pageType: PageType
    ): Promise<PageModel | null> => {
        if (pageType === "pdfFile") {
            return new PdfPageModel(
                new TComponentState(getDefaultPdfPageModelState())
            );
        }
        return null;
    },
    newPageModelFromState: async (
        state: Partial<IPage>
    ): Promise<PageModel> => {
        const initialState: PdfPageModelState = {
            ...getDefaultPdfPageModelState(),
            ...state,
        };
        return new PdfPageModel(new TComponentState(initialState));
    },
};

export default pdfEditorModule;
