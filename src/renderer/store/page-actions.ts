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

/**
 * Opens the Settings page. If already open, activates it.
 */
export async function showSettingsPage(): Promise<void> {
    const settingsModule = await import("../editors/settings/SettingsPage");
    const model = await settingsModule.default.newEmptyPageModel("settingsPage");
    if (model) {
        pagesModel.addPage(model);
    }
}

export interface ShowBrowserPageOptions {
    profileName?: string;
    incognito?: boolean;
}

/**
 * Opens a new Browser page.
 */
export async function showBrowserPage(options?: ShowBrowserPageOptions): Promise<void> {
    const browserModule = await import("../editors/browser/BrowserPageView");
    const model = await browserModule.default.newEmptyPageModel("browserPage");
    if (model) {
        if (options?.profileName || options?.incognito) {
            model.state.update((s: any) => {
                if (options.profileName) s.profileName = options.profileName;
                if (options.incognito) s.isIncognito = true;
            });
        }
        await model.restore();
        pagesModel.addPage(model);
    }
}
