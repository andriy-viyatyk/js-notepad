import { pagesModel } from "./pages-store";

/**
 * Opens the About page. If already open, activates it.
 */
export async function showAboutPage(): Promise<void> {
    const aboutModule = await import("../editors/about/AboutPage");
    const model = await aboutModule.default.newEmptyPageModel("aboutPage");
    if (model) {
        pagesModel.addPage(model);
    }
}
