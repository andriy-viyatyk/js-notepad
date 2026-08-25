const { ipcRenderer } = require("electron");
import { BrowserChannel } from "../../../ipc/browser-ipc";
import { createIconElement } from "../../uikit/shared/slots";
import { settings, BrowserProfile } from "../../api/settings";
import { BrowserBookmarks } from "./BrowserBookmarks";
import type {
    BrowserEditorModel,
    BrowserEditorState,
    BrowserTabData,
} from "./BrowserEditorModel";
import {
    DEFAULT_URL,
    createInternalTabId,
    createTabGroupId,
} from "./BrowserEditorModel";

/** Owns internal browser tabs and tab-scoped navigation/bookmark resources. */
export class BrowserTabsModel {
    readonly currentUrls = new Map<string, string>();
    private readonly faviconCache = new Map<string, string>();
    private activeTabHistory: string[] = [];
    bookmarks: BrowserBookmarks | null = null;

    constructor(readonly model: BrowserEditorModel) {
        // Preload bookmarks silently after a short delay (don't block browser page opening).
        setTimeout(() => this.preloadBookmarks(), 300);
    }

    getBookmarksFilePath = (): string => {
        const { profileName, isIncognito, isTor } = this.model.state.get();
        if (isTor) return settings.get("tor.bookmarks-file") || "";
        if (isIncognito) return settings.get("browser-incognito-bookmarks-file") || "";
        if (profileName) {
            const profiles = settings.get("browser-profiles");
            return profiles.find((p: BrowserProfile) => p.name === profileName)?.bookmarksFile || "";
        }
        const defaultName = settings.get("browser-default-profile");
        if (defaultName) {
            const profiles = settings.get("browser-profiles");
            return profiles.find((p: BrowserProfile) => p.name === defaultName)?.bookmarksFile || "";
        }
        return settings.get("browser-default-bookmarks-file") || "";
    };

    preloadBookmarks = async (): Promise<void> => {
        const filePath = this.getBookmarksFilePath();
        if (!filePath || this.bookmarks) return;
        const bm = new BrowserBookmarks(filePath);
        const ok = await bm.init({ silent: true });
        if (!ok) {
            await bm.dispose();
            return;
        }
        this.bookmarks = bm;
        this.configureBookmarks(bm);
        this.model.state.update((s) => { s.bookmarksReady = true; });
    };

    initBookmarks = async (filePath: string): Promise<BrowserBookmarks | null> => {
        if (this.bookmarks) await this.bookmarks.dispose();
        const bm = new BrowserBookmarks(filePath);
        const ok = await bm.init();
        if (!ok) {
            await bm.dispose();
            return null;
        }
        this.bookmarks = bm;
        this.configureBookmarks(bm);
        return bm;
    };

    cacheFavicon = (url: string, favicon: string) => {
        try {
            this.faviconCache.set(new URL(url).origin, favicon);
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

    addTab = (url = DEFAULT_URL, parentGroupId?: string): string => {
        const tab: BrowserTabData = {
            id: createInternalTabId(), url, pageTitle: "", loading: false,
            canGoBack: false, canGoForward: false, favicon: "", audible: false,
            muted: false, homeUrl: url !== DEFAULT_URL ? url : "", navHistory: [],
            groupId: parentGroupId || createTabGroupId(),
        };
        this.model.state.update((s) => {
            if (parentGroupId) {
                const activeIdx = s.tabs.findIndex((t) => t.id === s.activeTabId);
                s.tabs.splice(activeIdx + 1, 0, tab);
            } else {
                s.tabs.push(tab);
            }
            this.activeTabHistory.push(s.activeTabId);
            s.activeTabId = tab.id;
            this.syncTopLevelFromTab(s, tab);
        });
        return tab.id;
    };

    closeTab = (internalTabId: string) => {
        this.model.state.update((s) => {
            const idx = s.tabs.findIndex((t) => t.id === internalTabId);
            if (idx < 0) return;
            this.activeTabHistory = this.activeTabHistory.filter((id) => id !== internalTabId);
            if (s.tabs.length <= 1) {
                const fresh = this.createBlankTab();
                s.tabs = [fresh];
                s.activeTabId = fresh.id;
                this.currentUrls.delete(internalTabId);
                this.activeTabHistory = [];
                this.syncTopLevelFromTab(s, fresh);
                return;
            }
            s.tabs.splice(idx, 1);
            this.currentUrls.delete(internalTabId);
            if (s.activeTabId === internalTabId) {
                const tabIds = new Set(s.tabs.map((t) => t.id));
                let newActive: BrowserTabData | undefined;
                while (this.activeTabHistory.length > 0) {
                    const prevId = this.activeTabHistory.pop();
                    if (prevId && tabIds.has(prevId)) {
                        newActive = s.tabs.find((t) => t.id === prevId);
                        break;
                    }
                }
                if (!newActive) newActive = s.tabs[Math.min(idx, s.tabs.length - 1)];
                s.activeTabId = newActive.id;
                this.syncTopLevelFromTab(s, newActive);
            }
        });
    };

    closeOtherTabs = (internalTabId: string) => {
        this.model.state.update((s) => {
            const tab = s.tabs.find((t) => t.id === internalTabId);
            if (!tab) return;
            for (const t of s.tabs) if (t.id !== internalTabId) this.currentUrls.delete(t.id);
            s.tabs = [tab];
            s.activeTabId = tab.id;
            this.activeTabHistory = [];
            this.syncTopLevelFromTab(s, tab);
        });
    };

    closeTabsBelow = (internalTabId: string) => {
        this.model.state.update((s) => {
            const idx = s.tabs.findIndex((t) => t.id === internalTabId);
            if (idx < 0 || idx >= s.tabs.length - 1) return;
            const removed = s.tabs.splice(idx + 1);
            const removedIds = new Set(removed.map((t) => t.id));
            for (const t of removed) this.currentUrls.delete(t.id);
            this.activeTabHistory = this.activeTabHistory.filter((id) => !removedIds.has(id));
            if (!s.tabs.find((t) => t.id === s.activeTabId)) {
                const tab = s.tabs[idx];
                s.activeTabId = tab.id;
                this.syncTopLevelFromTab(s, tab);
            }
        });
    };

    moveTab = (fromId: string, toId: string) => {
        if (fromId === toId) return;
        this.model.state.update((s) => {
            const fromIndex = s.tabs.findIndex((t) => t.id === fromId);
            const toIndex = s.tabs.findIndex((t) => t.id === toId);
            if (fromIndex < 0 || toIndex < 0) return;
            const fromTab = s.tabs[fromIndex];
            const toTab = s.tabs[toIndex];
            if (fromTab.groupId !== toTab.groupId) fromTab.groupId = createTabGroupId();
            const [moved] = s.tabs.splice(fromIndex, 1);
            s.tabs.splice(toIndex, 0, moved);
        });
    };

    switchTab = (internalTabId: string) => {
        this.model.state.update((s) => {
            if (s.activeTabId === internalTabId) return;
            const tab = s.tabs.find((t) => t.id === internalTabId);
            if (!tab) return;
            this.activeTabHistory.push(s.activeTabId);
            s.activeTabId = internalTabId;
            this.syncTopLevelFromTab(s, tab);
            if (s.findBarVisible) {
                s.findBarVisible = false;
                s.findText = "";
                s.findActiveMatch = 0;
                s.findTotalMatches = 0;
            }
        });
    };

    toggleMute = (internalTabId: string) => {
        const s = this.model.state.get();
        const tab = s.tabs.find((t) => t.id === internalTabId);
        if (!tab) return;
        const newMuted = !tab.muted;
        this.model.updateTab(internalTabId, { muted: newMuted });
        ipcRenderer.send(BrowserChannel.setAudioMuted, `${this.model.id}/${internalTabId}`, newMuted || s.pageMuted);
    };

    toggleMuteAll = () => {
        const s = this.model.state.get();
        const newPageMuted = !s.pageMuted;
        this.model.state.update((st) => { st.pageMuted = newPageMuted; });
        for (const tab of s.tabs) {
            ipcRenderer.send(BrowserChannel.setAudioMuted, `${this.model.id}/${tab.id}`, tab.muted || newPageMuted);
        }
    };

    setPanelWidth = (width: number) => {
        const clamped = Math.max(34, Math.min(400, width));
        this.model.state.update((s) => { s.tabsPanelWidth = clamped; });
    };

    dispose = async () => {
        if (this.bookmarks) {
            await this.bookmarks.dispose();
            this.bookmarks = null;
        }
    };

    private createBlankTab = (): BrowserTabData => ({
        id: createInternalTabId(), url: DEFAULT_URL, pageTitle: "", loading: false,
        canGoBack: false, canGoForward: false, favicon: "", audible: false,
        muted: false, homeUrl: "", navHistory: [], groupId: createTabGroupId(),
    });

    private syncTopLevelFromTab = (s: BrowserEditorState, tab: BrowserTabData) => {
        s.url = this.currentUrls.get(tab.id) || tab.url;
        s.pageTitle = tab.pageTitle;
        s.loading = tab.loading;
        s.canGoBack = tab.canGoBack;
        s.canGoForward = tab.canGoForward;
        s.favicon = tab.favicon;
        s.title = tab.pageTitle || "Browser";
    };

    private configureBookmarks = (bm: BrowserBookmarks): void => {
        bm.linkEditor.onLinkOpen = (data) => {
            data.target = "browser";
            data.browserPageId = this.model.page?.id;
            const s = this.model.state.get();
            const currentTab = s.tabs.find((t) => t.id === s.activeTabId);
            if (!currentTab?.url || currentTab.url === DEFAULT_URL) data.browserTabMode = "navigate";
        };
        bm.linkEditor.onGetLinkMenuItems = (link) => link.href ? [{
            label: "Open in New Tab",
            icon: createIconElement("open-link"),
            onClick: () => this.addTab(link.href),
        }] : [];
        bm.linkEditor.imageProxySource = () => {
            const s = this.model.state.get();
            if (!s.isTor) return null;
            return { partition: this.model.partition, ready: s.torStatus === "connected" };
        };
        bm.panelHost.setInitialWidth(this.model.state.get().bookmarksSidebarWidth);
        bm.panelHost.onWidthChange = (w) => this.model.state.update((s) => { s.bookmarksSidebarWidth = w; });
    };
}
