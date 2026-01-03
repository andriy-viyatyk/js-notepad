import { PageModel } from "../model/page-model";
import { TextFileModel } from "../pages/text-file-page/TextFilePage.model";
import { pagesModel } from "../model/pages-model";

const wrapPage = (page?: PageModel) => {
    if (!page || !(page instanceof TextFileModel)) {
        return undefined;
    }
    const textPage = page as TextFileModel;

    return {
        get content() {
            return textPage.state.get().content;
        },
        set content(value: string) {
            textPage.changeContent(value);
        },
        get grouped() {
            let grouped = pagesModel.getGroupedPage(textPage.id);
            if (!grouped) {
                grouped = pagesModel.requireGroupedText(textPage.id);
            }
            return wrapPage(grouped);
        },
        get language() {
            return textPage.state.get().language;
        },
        set language(value: string) {
            textPage.changeLanguage(value);
        }
    }
}

export function createScriptContext(page?: PageModel) {
    return {
        page: wrapPage(page),

        ...globalThis,
    }
}