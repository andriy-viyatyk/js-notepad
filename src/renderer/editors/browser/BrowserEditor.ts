const { ipcRenderer } = require("electron");
import { TComponentState } from "../../core/state/state";
import {
    EditorModel,
    type RestoreData,
} from "../base/EditorModel";
import { ComponentQueue } from "../../core/state/ComponentQueue";
import type { EditorDescriptor } from "../../../shared/persistence";
import { globalKeyDown, SubscriptionObject } from "../../core/state/events";
import { pagesModel } from "../../api/pages";
import { IncognitoIcon, TorIcon } from "../../theme/language-icons";
import { GlobeIcon } from "../../theme/icons";
import { settings, BrowserProfile } from "../../api/settings";
import { DEFAULT_BROWSER_COLOR } from "../../theme/palette-colors";
import { BrowserChannel } from "../../../ipc/browser-ipc";
import { globalPopupRateLimiter } from "../../../ipc/popup-rate-limiter";
import { searchHistoryManager } from "./browser-search-history";
import { errMessage } from "../../../shared/utils";
import { BrowserWebviewModel } from "./BrowserWebviewModel";
import { BrowserUrlBarModel } from "./BrowserUrlBarModel";
import { BrowserBookmarksUIModel } from "./BrowserBookmarksUIModel";
import { BrowserTargetModel } from "./BrowserTargetModel";
import { BrowserTabsModel } from "./BrowserTabsModel";
import { BrowserTorModel } from "./BrowserTorModel";
import {
    BrowserEditorState,
    BrowserTabData,
    DEFAULT_URL,
    SEARCH_ENGINES,
    SearchEngine,
    createInternalTabId,
    createTabGroupId,
    detectSearchEngine,
} from "./BrowserEditorModel";

export type BrowserQueueEvent = { type: "focus" };
export type BrowserQueueRequest = never;

export class BrowserEditor extends EditorModel<
    BrowserEditorState,
    void,
    BrowserQueueEvent
> {
    readonly editorId = "browser-view";
    noLanguage = true;
    skipSave = true;

    /** Sub-model: webview refs, IPC events, context menu, keyboard shortcuts. */
    readonly webview: BrowserWebviewModel;
    /** Sub-model: URL input, suggestions, search engine selector. */
    readonly urlBar: BrowserUrlBarModel;
    /** Sub-model: bookmarks drawer, star button, image discovery. */
    readonly bookmarksUI: BrowserBookmarksUIModel;
    /** Sub-model: automation adapter for Playwright-compatible MCP tools. */
    readonly target: BrowserTargetModel;
    /** Sub-model: internal tabs, bookmark resource, and favicon/current-URL caches. */
    readonly tabs: BrowserTabsModel;
    /** Sub-model: Tor partition and daemon lifecycle. */
    readonly tor: BrowserTorModel;

    readonly typedQueue: ComponentQueue<BrowserQueueEvent, BrowserQueueRequest>;

    private keyDownSub: SubscriptionObject;

    constructor(state: TComponentState<BrowserEditorState>) {
        super(state);
        this.typedQueue = this.queue as unknown as ComponentQueue<
            BrowserQueueEvent,
            BrowserQueueRequest
        >;
        this.tabs = new BrowserTabsModel(this);
        this.tor = new BrowserTorModel(this);
        this.webview = new BrowserWebviewModel(this);
        this.urlBar = new BrowserUrlBarModel(this);
        this.bookmarksUI = new BrowserBookmarksUIModel(this);
        this.target = new BrowserTargetModel(this);
        this.keyDownSub = globalKeyDown.subscribe((e) => this.handleGlobalKeyDown(e));
    }

    /** Electron session partition string, derived from profile state. */
    get partition(): string {
        return this.tor.partition;
    }

    /** Ensure the Tor partition is armed before the first navigation. */
    armTorProxy = async (): Promise<void> => this.tor.armProxy();
    initTorProxy = async (): Promise<{ success: boolean; error?: string }> => this.tor.init();
    reconnectTor = async (): Promise<void> => this.tor.reconnect();
    showTorInfoDialog = async (): Promise<void> => this.tor.showInfoDialog();
    toggleTorOverlay = () => this.tor.toggleOverlay();

    async dispose(): Promise<void> {
        this.keyDownSub.unsubscribe();
        this.bookmarksUI.dispose();

        const s = this.state.get();
        await this.tabs.dispose();
        this.tor.dispose();

        await super.dispose();

        // Clear HTTP cache for this partition to free disk space.
        // Skip incognito/tor: no persist: prefix means no disk storage.
        if (!s.isIncognito && !s.isTor) {
            ipcRenderer.invoke(BrowserChannel.clearCache, this.partition);
        }
    }

    /** Handle global keyboard shortcuts when this browser page is active. */
    private handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.defaultPrevented) return;
        if (pagesModel.activePage !== this.page) return;

        const keyLower = e.key.toLowerCase();

        // F5 / Ctrl+F5 / Ctrl+R / Ctrl+Shift+R reload
        if (e.key === "F5" || (keyLower === "r" && e.ctrlKey)) {
            e.preventDefault();
            if (e.key === "F5" ? e.ctrlKey : e.shiftKey) {
                this.webview.hardReload();
            } else {
                this.webview.reloadOrStop();
            }
            return;
        }
        // F12 devtools
        if (e.key === "F12") {
            e.preventDefault();
            this.webview.openDevTools();
            return;
        }
        // Ctrl+F open find bar
        if (keyLower === "f" && e.ctrlKey) {
            e.preventDefault();
            this.webview.openFind();
            return;
        }
        // Escape: close find bar first, then stop loading
        if (e.key === "Escape") {
            e.preventDefault();
            if (this.state.get().findBarVisible) {
                this.webview.closeFind();
            } else {
                this.webview.getActiveWebview()?.stop();
            }
            return;
        }
        // Alt+Left / Alt+Right: back / forward
        if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
            e.preventDefault();
            if (e.key === "ArrowLeft") {
                this.webview.goBack();
            } else {
                this.webview.goForward();
            }
            return;
        }
        // Alt+Home: go to home page
        if (e.altKey && e.key === "Home") {
            e.preventDefault();
            this.goHome();
            return;
        }
    };

    focus(): void {
        this.typedQueue.send({ type: "focus" });
    }

    async restore(): Promise<void> {
        await super.restore();
        const s = this.state.get();

        // Arm here rather than only at the `showBrowserPage` call site: this runs on
        // every path that produces a Tor page, session restore included, and always
        // before the page is added to the window. A restored Tor page resets its tabs
        // to about:blank and waits for Reconnect, but its URL bar is live without
        // this, typing a URL before reconnecting would navigate a bare partition
        // straight out onto the normal network. Failures are recorded rather than
        // thrown, so a page is never dropped from a restore; the overlay then shows
        // the error, `reconnectTor` retries the arming, and for a newly opened page
        // `showBrowserPage` re-asserts it and declines to open on failure.
        if (s.isTor) {
            try {
                await this.armTorProxy();
            } catch (err) {
                this.state.update((st) => {
                    st.torStatus = "error";
                    st.torOverlayVisible = true;
                    st.torLog += (st.torLog ? "\n" : "")
                        + `Could not secure the session: ${errMessage(err)}`;
                });
            }
        }

        if (s.url && s.url !== DEFAULT_URL) {
            this.state.update((st) => {
                st.title = st.pageTitle || "Browser";
            });
        }
    }

    getRestoreData(): EditorDescriptor {
        const s = this.state.get();
        // Save all tabs with their actual current URLs
        const tabs = s.tabs.map((t) => ({
            ...t,
            url: this.tabs.currentUrls.get(t.id) || t.url,
        }));
        // Top-level url = active tab's actual URL
        const activeTab = tabs.find((t) => t.id === s.activeTabId);
        const url = activeTab ? activeTab.url : s.url;
        return {
            editorId: this.editorId,
            id: s.id,
            state: {
                title: s.title,
                modified: s.modified,
                secondaryView: s.secondaryView,
                url,
                pageTitle: s.pageTitle,
                tabs,
                activeTabId: s.activeTabId,
                tabsPanelWidth: s.tabsPanelWidth,
                bookmarksWidth: s.bookmarksWidth, // NH3 promoted to persisted (sixth instance of leftPanelWidth-equivalent silent fix)
                bookmarksSidebarWidth: s.bookmarksSidebarWidth, // US-601 SecondaryViews sidebar width

                profileName: s.profileName,
                isIncognito: s.isIncognito,
                isTor: s.isTor,
                searchEngineId: s.searchEngineId,
                lastSearchQuery: s.lastSearchQuery,
            } as Record<string, unknown>,
        };
    }

    applyRestoreData(data: RestoreData<BrowserEditorState>): void {
        super.applyRestoreData(data);
        this.state.update((s) => {
            if (data.tabs && data.tabs.length > 0) {
                // Re-assign fresh IDs to restored tabs
                s.tabs = data.tabs.map((t) => ({
                    ...t,
                    id: createInternalTabId(),
                    groupId: t.groupId || createTabGroupId(),
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
            if (data.bookmarksWidth !== undefined) s.bookmarksWidth = data.bookmarksWidth; // NH3
            if (data.bookmarksSidebarWidth !== undefined) s.bookmarksSidebarWidth = data.bookmarksSidebarWidth; // US-601
            if (data.profileName !== undefined) s.profileName = data.profileName;
            if (data.isIncognito !== undefined) s.isIncognito = data.isIncognito;
            if (data.isTor !== undefined) {
                s.isTor = data.isTor;
                if (data.isTor) {
                    // After restore: show overlay with "Reconnect", clear tabs
                    s.torStatus = "disconnected";
                    s.torOverlayVisible = true;
                    const fresh = {
                        id: createInternalTabId(),
                        url: DEFAULT_URL,
                        pageTitle: "",
                        loading: false,
                        canGoBack: false,
                        canGoForward: false,
                        favicon: "",
                        audible: false,
                        muted: false,
                        homeUrl: "",
                        navHistory: [] as string[],
                        groupId: createTabGroupId(),
                    } satisfies BrowserTabData;
                    s.tabs = [fresh];
                    s.activeTabId = fresh.id;
                    s.url = DEFAULT_URL;
                    s.pageTitle = "";
                    s.title = "Browser";
                }
            }
            if (data.searchEngineId) s.searchEngineId = data.searchEngineId;
            if (data.lastSearchQuery) s.lastSearchQuery = data.lastSearchQuery;
        });
    }

    getIconElement = (): SVGElement | undefined => {
        const s = this.state.get();
        if (s.isTor) return TorIcon.createElement();
        if (s.isIncognito) return IncognitoIcon.createElement();
        return GlobeIcon.createElement({ color: this.resolvedColor });
    };

    /** Resolved icon color: profile color for named profiles, default browser color otherwise. */
    get resolvedColor(): string {
        const profileName = this.state.get().profileName;
        if (profileName) {
            const profiles = settings.get("browser-profiles");
            return profiles.find((p: BrowserProfile) => p.name === profileName)?.color || DEFAULT_BROWSER_COLOR;
        }
        // No explicit profile: resolve from the default profile setting
        const defaultName = settings.get("browser-default-profile");
        if (defaultName) {
            const profiles = settings.get("browser-profiles");
            return profiles.find((p: BrowserProfile) => p.name === defaultName)?.color || DEFAULT_BROWSER_COLOR;
        }
        return DEFAULT_BROWSER_COLOR;
    }

    /** Get the currently selected search engine. */
    getSearchEngine(): SearchEngine {
        const id = this.state.get().searchEngineId;
        return SEARCH_ENGINES.find((e) => e.id === id) || SEARCH_ENGINES[0];
    }

    /** Set the search engine by ID. */
    setSearchEngine = (engineId: string) => {
        this.state.update((s) => { s.searchEngineId = engineId; });
    };

    /** Switch the current search query to a different engine. Also updates the tab's homeUrl. */
    switchSearchEngine = (engineId: string) => {
        const s = this.state.get();
        const currentUrl = this.tabs.currentUrls.get(s.activeTabId) || s.url;
        const detected = detectSearchEngine(currentUrl);
        this.setSearchEngine(engineId);
        const query = detected?.query || s.lastSearchQuery;
        if (detected && query) {
            const newEngine = SEARCH_ENGINES.find((e) => e.id === engineId);
            if (newEngine) {
                const newUrl = newEngine.searchUrl.replace("%s", encodeURIComponent(query));
                this.state.update((st) => {
                    st.url = newUrl;
                    const tab = st.tabs.find((t) => t.id === st.activeTabId);
                    if (tab) {
                        tab.url = newUrl;
                        tab.homeUrl = newUrl;
                    }
                });
            }
        }
    };

    navigate = (url: string) => {
        let normalizedUrl = url.trim();
        if (!normalizedUrl) return;

        // Convert a Windows file path (drive or UNC) pasted into the URL bar
        // into a file:// URL so the webview can load it.
        if (
            /^[a-zA-Z]:[\\/]/.test(normalizedUrl) ||
            normalizedUrl.startsWith("\\\\")
        ) {
            try {
                const { pathToFileURL } = require("url") as typeof import("url");
                normalizedUrl = pathToFileURL(normalizedUrl).href;
            } catch {
                // Fall through to the existing search/scheme heuristic.
            }
        }

        const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedUrl);

        if (!hasScheme && !normalizedUrl.startsWith("about:")) {
            if (
                normalizedUrl.includes(".") &&
                !normalizedUrl.includes(" ")
            ) {
                normalizedUrl = "https://" + normalizedUrl;
            } else {
                const engine = this.getSearchEngine();
                this.state.update((s) => { s.lastSearchQuery = normalizedUrl; });
                const st = this.state.get();
                searchHistoryManager.get(st.profileName, st.isIncognito)?.add(normalizedUrl);
                normalizedUrl = engine.searchUrl.replace(
                    "%s",
                    encodeURIComponent(normalizedUrl),
                );
            }
        }

        this.state.update((s) => {
            s.url = normalizedUrl;
            const tab = s.tabs.find((t) => t.id === s.activeTabId);
            if (tab) {
                tab.url = normalizedUrl;
                tab.homeUrl = normalizedUrl;
            }
        });
    };

    /** Navigate the active tab to its home URL. */
    goHome = () => {
        const s = this.state.get();
        const tab = s.tabs.find((t) => t.id === s.activeTabId);
        if (tab?.homeUrl) {
            this.navigate(tab.homeUrl);
        }
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
            if (updates.audible !== undefined) {
                tab.audible = updates.audible;
                s._anyTabAudible = s.tabs.some((t) => t.audible);
            }
            if (updates.muted !== undefined) tab.muted = updates.muted;

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

    /** Record a navigation in the tab's history and add hostname to search history. */
    addNavHistory = (internalTabId: string, url: string) => {
        if (!url || url === DEFAULT_URL) return;
        this.state.update((s) => {
            const tab = s.tabs.find((t) => t.id === internalTabId);
            if (!tab) return;
            tab.navHistory = [
                url,
                ...tab.navHistory.filter((u) => u !== url),
            ].slice(0, 100);
        });
        // Add hostname to search history (unless incognito/tor)
        const s = this.state.get();
        if (!s.isIncognito && !s.isTor) {
            try {
                const hostname = new URL(url).hostname;
                if (hostname) {
                    searchHistoryManager.get(s.profileName, false)?.add(hostname);
                }
            } catch { /* invalid URL */ }
        }
    };

    /** Add a new internal tab and switch to it.
     *  If parentGroupId is provided, the new tab inherits that group and is inserted after the active tab.
     *  Otherwise the tab is appended at the end. Returns the new tab's ID. */
    addTab = (url = DEFAULT_URL, parentGroupId?: string): string => this.tabs.addTab(url, parentGroupId);
    closeTab = (internalTabId: string) => this.tabs.closeTab(internalTabId);
    closeOtherTabs = (internalTabId: string) => this.tabs.closeOtherTabs(internalTabId);
    closeTabsBelow = (internalTabId: string) => this.tabs.closeTabsBelow(internalTabId);
    moveTab = (fromId: string, toId: string) => this.tabs.moveTab(fromId, toId);
    switchTab = (internalTabId: string) => this.tabs.switchTab(internalTabId);
    toggleMute = (internalTabId: string) => this.tabs.toggleMute(internalTabId);
    toggleMuteAll = () => this.tabs.toggleMuteAll();
    setTabsPanelWidth = (width: number) => this.tabs.setPanelWidth(width);

    dismissBlockedPopups = () => {
        this.state.update((s) => { s.blockedPopupCount = 0; });
    };

    allowPopups = () => {
        this.webview.popupsAllowed = true;
        globalPopupRateLimiter.allow("tabs");
        ipcRenderer.send(BrowserChannel.allowPopups);
        this.state.update((s) => { s.blockedPopupCount = 0; });
    };

}
