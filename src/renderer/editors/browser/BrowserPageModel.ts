import { createElement, ReactNode } from "react";
import { IPage } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { GlobeIcon } from "../../theme/icons";

export interface BrowserPageState extends IPage {
    url: string;
    pageTitle: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    favicon: string;
}

const DEFAULT_URL = "about:blank";

export const getDefaultBrowserPageState = (): BrowserPageState => ({
    ...getDefaultPageModelState(),
    type: "browserPage",
    title: "Browser",
    editor: "browser-view",
    url: DEFAULT_URL,
    pageTitle: "",
    loading: false,
    canGoBack: false,
    canGoForward: false,
    favicon: "",
});

export class BrowserPageModel extends PageModel<BrowserPageState, void> {
    noLanguage = true;
    skipSave = true;

    /** The actual current URL in the webview (may differ from state.url after redirects). */
    currentUrl = "";
    private faviconCache = new Map<string, string>();

    async restore() {
        await super.restore();
        const url = this.state.get().url;
        if (url && url !== DEFAULT_URL) {
            this.state.update((s) => {
                s.title = s.pageTitle || "Browser";
            });
        }
    }

    getRestoreData(): Partial<BrowserPageState> {
        const data = super.getRestoreData() as Partial<BrowserPageState>;
        data.url = this.currentUrl || this.state.get().url;
        data.pageTitle = this.state.get().pageTitle;
        return data;
    }

    applyRestoreData(data: Partial<BrowserPageState>): void {
        super.applyRestoreData(data);
        this.state.update((s) => {
            if (data.url) s.url = data.url;
            if (data.pageTitle) s.pageTitle = data.pageTitle;
        });
    }

    getIcon = (): ReactNode => {
        const favicon = this.state.get().favicon;
        if (favicon) {
            return createElement("img", { src: favicon, alt: "" });
        }
        return createElement(GlobeIcon);
    };

    cacheFavicon = (url: string, favicon: string) => {
        try {
            const origin = new URL(url).origin;
            this.faviconCache.set(origin, favicon);
        } catch {
            // Invalid URL
        }
    };

    getCachedFavicon = (url: string): string => {
        try {
            return this.faviconCache.get(new URL(url).origin) || "";
        } catch {
            return "";
        }
    };

    navigate = (url: string) => {
        let normalizedUrl = url.trim();
        if (!normalizedUrl) return;

        if (
            !normalizedUrl.startsWith("http://") &&
            !normalizedUrl.startsWith("https://") &&
            !normalizedUrl.startsWith("about:")
        ) {
            if (normalizedUrl.includes(".") && !normalizedUrl.includes(" ")) {
                normalizedUrl = "https://" + normalizedUrl;
            } else {
                normalizedUrl =
                    "https://www.google.com/search?q=" +
                    encodeURIComponent(normalizedUrl);
            }
        }

        this.state.update((s) => {
            s.url = normalizedUrl;
        });
    };

    updateFromWebview = (updates: Partial<BrowserPageState>) => {
        this.state.update((s) => {
            if (updates.url !== undefined) s.url = updates.url;
            if (updates.pageTitle !== undefined) {
                s.pageTitle = updates.pageTitle;
                s.title = updates.pageTitle || "Browser";
            }
            if (updates.loading !== undefined) s.loading = updates.loading;
            if (updates.canGoBack !== undefined) s.canGoBack = updates.canGoBack;
            if (updates.canGoForward !== undefined)
                s.canGoForward = updates.canGoForward;
            if (updates.favicon !== undefined) s.favicon = updates.favicon;
        });
    };
}

export function newBrowserPageModel(): BrowserPageModel {
    return new BrowserPageModel(
        new TComponentState(getDefaultBrowserPageState()),
    );
}
