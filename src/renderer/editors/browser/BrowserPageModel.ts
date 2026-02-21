import { createElement, ReactNode } from "react";
import { IPage } from "../../../shared/types";
import { getDefaultPageModelState, PageModel } from "../base";
import { TComponentState } from "../../core/state/state";
import { IncognitoIcon } from "../../theme/language-icons";
import { GlobeIcon } from "../../theme/icons";
import { appSettings, BrowserProfile } from "../../store/app-settings";
import { DEFAULT_BROWSER_COLOR } from "../../theme/palette-colors";

/** State for a single internal browser tab. */
export interface BrowserTabData {
    id: string;
    url: string;
    pageTitle: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    favicon: string;
}

export interface BrowserPageState extends IPage {
    /** Active internal tab's URL (kept in sync for toolbar display). */
    url: string;
    pageTitle: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    favicon: string;
    /** All internal browser tabs. */
    tabs: BrowserTabData[];
    /** ID of the active internal tab. */
    activeTabId: string;
    /** Width of the right-side tabs panel. */
    tabsPanelWidth: number;
    /** Profile name ("" for default). */
    profileName: string;
    /** Whether this is an incognito session. */
    isIncognito: boolean;
}

const DEFAULT_URL = "about:blank";

let nextInternalTabId = 1;

export function createInternalTabId(): string {
    return `bt-${nextInternalTabId++}`;
}

function createTab(url = DEFAULT_URL): BrowserTabData {
    return {
        id: createInternalTabId(),
        url,
        pageTitle: "",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        favicon: "",
    };
}

export const getDefaultBrowserPageState = (): BrowserPageState => {
    const tab = createTab();
    return {
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
        tabs: [tab],
        activeTabId: tab.id,
        tabsPanelWidth: 120,
        profileName: "",
        isIncognito: false,
    };
};

/** Compute the Electron session partition string for a browser page. */
export function getPartitionString(profileName: string, isIncognito: boolean, incognitoId?: string): string {
    if (isIncognito) {
        return `browser-incognito-${incognitoId || crypto.randomUUID()}`;
    }
    return `persist:browser-${profileName || "default"}`;
}

export class BrowserPageModel extends PageModel<BrowserPageState, void> {
    noLanguage = true;
    skipSave = true;

    /** Stable random ID for incognito partitions (generated once per model instance). */
    private incognitoId = crypto.randomUUID();

    /** Electron session partition string, derived from profile state. */
    get partition(): string {
        const s = this.state.get();
        return getPartitionString(s.profileName, s.isIncognito, this.incognitoId);
    }

    /** Per-tab actual current URL (may differ from state after redirects). Keyed by internalTabId. */
    currentUrls = new Map<string, string>();
    private faviconCache = new Map<string, string>();

    async restore() {
        await super.restore();
        const s = this.state.get();
        if (s.url && s.url !== DEFAULT_URL) {
            this.state.update((st) => {
                st.title = st.pageTitle || "Browser";
            });
        }
    }

    getRestoreData(): Partial<BrowserPageState> {
        const data = super.getRestoreData() as Partial<BrowserPageState>;
        const s = this.state.get();
        // Save all tabs with their actual current URLs
        data.tabs = s.tabs.map((t) => ({
            ...t,
            url: this.currentUrls.get(t.id) || t.url,
        }));
        data.activeTabId = s.activeTabId;
        data.tabsPanelWidth = s.tabsPanelWidth;
        data.pageTitle = s.pageTitle;
        data.profileName = s.profileName;
        data.isIncognito = s.isIncognito;
        // Top-level url = active tab's actual URL
        const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
        data.url = activeTab
            ? this.currentUrls.get(activeTab.id) || activeTab.url
            : s.url;
        return data;
    }

    applyRestoreData(data: Partial<BrowserPageState>): void {
        super.applyRestoreData(data);
        this.state.update((s) => {
            if (data.tabs && data.tabs.length > 0) {
                // Re-assign fresh IDs to restored tabs
                s.tabs = data.tabs.map((t) => ({
                    ...t,
                    id: createInternalTabId(),
                }));
                // Map activeTabId: if the original activeTabId matches a tab by index, use the new ID
                const origIndex = data.tabs.findIndex(
                    (t) => t.id === data.activeTabId,
                );
                s.activeTabId =
                    origIndex >= 0 ? s.tabs[origIndex].id : s.tabs[0].id;
                // Sync top-level state from active tab
                const active = s.tabs.find((t) => t.id === s.activeTabId);
                if (active) {
                    s.url = active.url;
                    s.pageTitle = active.pageTitle;
                    s.favicon = active.favicon;
                    s.title = active.pageTitle || "Browser";
                }
            } else {
                if (data.url) s.url = data.url;
                if (data.pageTitle) s.pageTitle = data.pageTitle;
            }
            if (data.tabsPanelWidth) s.tabsPanelWidth = data.tabsPanelWidth;
            if (data.profileName !== undefined) s.profileName = data.profileName;
            if (data.isIncognito !== undefined) s.isIncognito = data.isIncognito;
        });
    }

    getIcon = (): ReactNode => {
        const s = this.state.get();
        if (s.isIncognito) {
            return createElement(IncognitoIcon);
        }
        return createElement(GlobeIcon, { color: this.resolvedColor });
    };

    /** Resolved icon color: profile color for named profiles, default browser color otherwise. */
    get resolvedColor(): string {
        const profileName = this.state.get().profileName;
        if (profileName) {
            const profiles = appSettings.get("browser-profiles");
            return profiles.find((p: BrowserProfile) => p.name === profileName)?.color || DEFAULT_BROWSER_COLOR;
        }
        // No explicit profile — resolve from the default profile setting
        const defaultName = appSettings.get("browser-default-profile");
        if (defaultName) {
            const profiles = appSettings.get("browser-profiles");
            return profiles.find((p: BrowserProfile) => p.name === defaultName)?.color || DEFAULT_BROWSER_COLOR;
        }
        return DEFAULT_BROWSER_COLOR;
    }

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
            if (
                normalizedUrl.includes(".") &&
                !normalizedUrl.includes(" ")
            ) {
                normalizedUrl = "https://" + normalizedUrl;
            } else {
                normalizedUrl =
                    "https://www.google.com/search?q=" +
                    encodeURIComponent(normalizedUrl);
            }
        }

        this.state.update((s) => {
            s.url = normalizedUrl;
            const tab = s.tabs.find((t) => t.id === s.activeTabId);
            if (tab) {
                tab.url = normalizedUrl;
            }
        });
    };

    /** Update the active internal tab and sync top-level state. */
    updateTab = (
        internalTabId: string,
        updates: Partial<BrowserTabData>,
    ) => {
        this.state.update((s) => {
            const tab = s.tabs.find((t) => t.id === internalTabId);
            if (!tab) return;
            if (updates.url !== undefined) tab.url = updates.url;
            if (updates.pageTitle !== undefined) tab.pageTitle = updates.pageTitle;
            if (updates.loading !== undefined) tab.loading = updates.loading;
            if (updates.canGoBack !== undefined) tab.canGoBack = updates.canGoBack;
            if (updates.canGoForward !== undefined)
                tab.canGoForward = updates.canGoForward;
            if (updates.favicon !== undefined) tab.favicon = updates.favicon;

            // Sync top-level state if this is the active tab
            if (internalTabId === s.activeTabId) {
                if (updates.pageTitle !== undefined) {
                    s.pageTitle = updates.pageTitle;
                    s.title = updates.pageTitle || "Browser";
                }
                if (updates.loading !== undefined) s.loading = updates.loading;
                if (updates.canGoBack !== undefined)
                    s.canGoBack = updates.canGoBack;
                if (updates.canGoForward !== undefined)
                    s.canGoForward = updates.canGoForward;
                if (updates.favicon !== undefined) s.favicon = updates.favicon;
            }
        });
    };

    /** Add a new internal tab and switch to it. Returns the new tab's ID. */
    addTab = (url = DEFAULT_URL): string => {
        const tab = createTab(url);
        this.state.update((s) => {
            s.tabs.push(tab);
            s.activeTabId = tab.id;
            // Sync top-level state
            s.url = tab.url;
            s.pageTitle = tab.pageTitle;
            s.loading = false;
            s.canGoBack = false;
            s.canGoForward = false;
            s.favicon = "";
            s.title = "Browser";
        });
        return tab.id;
    };

    /** Close an internal tab. If it's the active one, switch to adjacent tab. */
    closeTab = (internalTabId: string) => {
        this.state.update((s) => {
            if (s.tabs.length <= 1) return; // Keep at least one tab
            const idx = s.tabs.findIndex((t) => t.id === internalTabId);
            if (idx < 0) return;
            s.tabs.splice(idx, 1);
            this.currentUrls.delete(internalTabId);

            if (s.activeTabId === internalTabId) {
                // Switch to the tab at same index, or the last one
                const newIdx = Math.min(idx, s.tabs.length - 1);
                const newActive = s.tabs[newIdx];
                s.activeTabId = newActive.id;
                this.syncTopLevelFromTab(s, newActive);
            }
        });
    };

    /** Close all tabs except the specified one. */
    closeOtherTabs = (internalTabId: string) => {
        this.state.update((s) => {
            const tab = s.tabs.find((t) => t.id === internalTabId);
            if (!tab) return;
            for (const t of s.tabs) {
                if (t.id !== internalTabId) {
                    this.currentUrls.delete(t.id);
                }
            }
            s.tabs = [tab];
            s.activeTabId = tab.id;
            this.syncTopLevelFromTab(s, tab);
        });
    };

    /** Close all tabs below (after) the specified one. */
    closeTabsBelow = (internalTabId: string) => {
        this.state.update((s) => {
            const idx = s.tabs.findIndex((t) => t.id === internalTabId);
            if (idx < 0 || idx >= s.tabs.length - 1) return;
            const removed = s.tabs.splice(idx + 1);
            for (const t of removed) {
                this.currentUrls.delete(t.id);
            }
            // If active tab was removed, switch to the specified tab
            if (!s.tabs.find((t) => t.id === s.activeTabId)) {
                const tab = s.tabs[idx];
                s.activeTabId = tab.id;
                this.syncTopLevelFromTab(s, tab);
            }
        });
    };

    /** Switch to a different internal tab. */
    switchTab = (internalTabId: string) => {
        this.state.update((s) => {
            if (s.activeTabId === internalTabId) return;
            const tab = s.tabs.find((t) => t.id === internalTabId);
            if (!tab) return;
            s.activeTabId = internalTabId;
            this.syncTopLevelFromTab(s, tab);
        });
    };

    setTabsPanelWidth = (width: number) => {
        const clamped = Math.max(34, Math.min(400, width));
        this.state.update((s) => {
            s.tabsPanelWidth = clamped;
        });
    };

    private syncTopLevelFromTab(s: BrowserPageState, tab: BrowserTabData) {
        s.url = this.currentUrls.get(tab.id) || tab.url;
        s.pageTitle = tab.pageTitle;
        s.loading = tab.loading;
        s.canGoBack = tab.canGoBack;
        s.canGoForward = tab.canGoForward;
        s.favicon = tab.favicon;
        s.title = tab.pageTitle || "Browser";
    }
}

export function newBrowserPageModel(): BrowserPageModel {
    return new BrowserPageModel(
        new TComponentState(getDefaultBrowserPageState()),
    );
}
