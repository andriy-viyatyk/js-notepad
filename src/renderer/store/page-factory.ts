import { IPage, PageType } from "../../shared/types";
import { newTextFileModel, newTextFileModelFromState } from "../editors/text";
import { PageModel } from "../editors/base";
const path = require("path");

export async function newPageModel(filePath?: string): Promise<PageModel> {
    if (!filePath) {
        return newTextFileModel(filePath);
    }

    const ext = path.extname(filePath || "").toLowerCase();
    switch (ext) {
        case ".pdf": {
            const module = await import("../editors/pdf/PdfViewer");
            return module.default.newPageModel(filePath);
        }
        default:
            return newTextFileModel(filePath);
    }
}

export async function newEmptyPageModel(pageType: PageType): Promise<PageModel | null> {
    switch (pageType) {
        case "textFile":
            return newTextFileModel();
        case "pdfFile": {
            const module = await import("../editors/pdf/PdfViewer");
            return module.default.newEmptyPageModel(pageType);
        }
        default:
            console.warn("Unknown page type:", pageType);
            return null;
    }
}

export async function newPageModelFromState(state: Partial<IPage>): Promise<PageModel> {
    switch (state.type) {
        case "textFile":
            return newTextFileModelFromState(state);
        case "pdfFile": {
            const module = await import("../editors/pdf/PdfViewer");
            return module.default.newPageModelFromState(state);
        }
        default:
            return newTextFileModelFromState(state);
    }
}
