const { ipcRenderer } = require("electron");
import { KeyboardEvent } from "react";
import {
    BrowserChannel,
    BrowserEvent,
} from "../../../ipc/browser-ipc";
import type { MenuItem } from "../../uikit/Menu";
import { pagesModel } from "../../api/pages";
import { ui } from "../../api/ui";

import { globalPopupRateLimiter } from "../../../ipc/popup-rate-limiter";
import { browserUrlChanged } from "../../core/state/events";
import type { BrowserEditorModel } from "./BrowserEditorModel";
import { showBrowserContextMenu } from "./webview-context-menu";

/**
 * Manages webview references, IPC event handling, context menu,
 * and keyboard shortcuts for the browser editor.
 */
export class BrowserWebviewModel {
    readonly model: BrowserEditorModel;
    /** Map from internal tab ID to webview element. */
    webviewRefs = new Map<string, Electron.WebviewTag>();
    /** Set of internalTabIds whose webview has fired dom-ready. */
    webviewReady = new Set<string>();

    /** When true, rate limiting is disabled (user clicked "Allow"). */
    popupsAllowed = false;

    /** Tracks the previous active tab URL for navigation change detection. */
    private prevActiveUrl = "";

    constructor(model: BrowserEditorModel) {
        this.model = model;
    }

    /** Get the active tab's webview element. */
    getActiveWebview = (): Electron.WebviewTag | undefined => {
        const { activeTabId } = this.model.state.get();
        return this.webviewRefs.get(activeTabId);
    };

    goBack = () => {
        this.getActiveWebview()?.goBack();
    };

    goForward = () => {
        this.getActiveWebview()?.goForward();
    };

    reloadOrStop = () => {
        const wv = this.getActiveWebview();
        if (!wv) return;
        if (this.model.state.get().loading) {
            wv.stop();
        } else {
            wv.reload();
        }
    };

    /** Hard reload (ignore cache) the active tab, bypassing any beforeunload
     *  guard prompt. Routed through the main process so the bypass flag is
     *  armed atomically with the reload (see browser-service.ts). */
    hardReload = () => {
        const { activeTabId } = this.model.state.get();
        if (!this.webviewRefs.has(activeTabId)) return;
        ipcRenderer.send(
            BrowserChannel.hardReload,
            `${this.model.id}/${activeTabId}`,
        );
    };

    openDevTools = () => {
        this.getActiveWebview()?.openDevTools();
    };

    /** Handle keyboard shortcuts on the root browser div (Ctrl+L, Ctrl+F). */
    handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.ctrlKey && e.key === "l") {
            e.preventDefault();
            this.model.urlBar.focusUrlInput();
        }
        if (e.ctrlKey && e.key === "f") {
            e.preventDefault();
            this.openFind();
        }
    };

    // =====================================================================
    // Find in Page
    // =====================================================================

    openFind = () => {
        this.model.state.update((s) => { s.findBarVisible = true; });
    };

    closeFind = () => {
        const webview = this.getActiveWebview();
        webview?.stopFindInPage("clearSelection");
        this.model.state.update((s) => {
            s.findBarVisible = false;
            s.findText = "";
            s.findActiveMatch = 0;
            s.findTotalMatches = 0;
        });
    };

    setFindText = (text: string) => {
        this.model.state.update((s) => { s.findText = text; });
        const webview = this.getActiveWebview();
        if (!webview) return;
        if (text) {
            webview.findInPage(text);
        } else {
            webview.stopFindInPage("clearSelection");
            this.model.state.update((s) => {
                s.findActiveMatch = 0;
                s.findTotalMatches = 0;
            });
        }
    };

    findNext = () => {
        const { findText } = this.model.state.get();
        if (!findText) return;
        const webview = this.getActiveWebview();
        webview?.findInPage(findText, { forward: true, findNext: true });
    };

    findPrev = () => {
        const { findText } = this.model.state.get();
        if (!findText) return;
        const webview = this.getActiveWebview();
        webview?.findInPage(findText, { forward: false, findNext: true });
    };

    handleFoundInPage = (result: Electron.FoundInPageResult) => {
        if (result.finalUpdate) {
            this.model.state.update((s) => {
                s.findActiveMatch = result.activeMatchOrdinal - 1;
                s.findTotalMatches = result.matches;
            });
        }
    };

    /**
     * Navigate the active tab's webview when the tab URL changes.
     * Called from the view's useEffect when activeTab.url changes.
     */
    navigateWebview = (activeTabId: string, url: string) => {
        if (url !== this.prevActiveUrl && url !== "about:blank") {
            const webview = this.webviewRefs.get(activeTabId);
            if (webview && this.webviewReady.has(activeTabId)) {
                const actualUrl = this.model.tabs.currentUrls.get(activeTabId) || "";
                if (actualUrl !== url) {
                    webview.loadURL(url);
                }
            }
        }
        this.prevActiveUrl = url;
    };

    // =====================================================================
    // IPC Event Handler
    // =====================================================================

    /** Set up the global IPC event listener. Call from useEffect. */
    initIpcHandler = () => {
        ipcRenderer.on(BrowserChannel.event, this.handleBrowserEvent);
    };

    /** Remove the IPC event listener. Call from useEffect cleanup. */
    disposeIpcHandler = () => {
        ipcRenderer.removeListener(BrowserChannel.event, this.handleBrowserEvent);
    };

    /** Apply shared state updates for full and in-page navigation events. */
    private applyNavigation = (
        internalTabId: string,
        data: { url?: string; canGoBack?: boolean; canGoForward?: boolean },
        inPage: boolean,
    ) => {
        const url = data.url || "";
        this.model.tabs.currentUrls.set(internalTabId, url);
        if (internalTabId === this.model.state.get().activeTabId) {
            this.model.urlBar.syncFromUrl(url);
            if (!inPage && this.model.state.get().findBarVisible) this.closeFind();
        }
        this.model.updateTab(internalTabId, {
            url: data.url,
            canGoBack: data.canGoBack,
            canGoForward: data.canGoForward,
            ...(!inPage ? { favicon: this.model.tabs.getCachedFavicon(url) } : {}),
        });
        this.model.addNavHistory(internalTabId, url);
        if (!inPage) this.model.bookmarksUI.shiftTrackedImages(internalTabId);
        if (data.url) browserUrlChanged.send({ url: data.url });
    };

    private handleBrowserEvent = async (
        _event: Electron.IpcRendererEvent,
        browserEvent: BrowserEvent,
    ) => {
        const pageTabId = this.model.id;
        if (browserEvent.tabId !== pageTabId) return;
        const { internalTabId, type, data } = browserEvent;

        switch (type) {
            case "did-navigate": {
                this.applyNavigation(internalTabId, data, false);
                break;
            }
            case "did-navigate-in-page": {
                this.applyNavigation(internalTabId, data, true);
                break;
            }
            case "did-start-loading":
                this.model.updateTab(internalTabId, { loading: true });
                break;
            case "did-stop-loading":
                this.model.updateTab(internalTabId, { loading: false });
                break;
            case "audio-state-changed":
                this.model.updateTab(internalTabId, { audible: !!data.audible });
                break;
            case "did-start-navigation": {
                if (data.blocked) {
                    const webview = this.webviewRefs.get(internalTabId);
                    const tabData = this.model.state
                        .get()
                        .tabs.find((t) => t.id === internalTabId);
                    if (webview && tabData && tabData.url !== data.url) {
                        webview.goBack();
                    }
                }
                break;
            }
            case "new-window": {
                if (data.url) {
                    if (!this.popupsAllowed && !globalPopupRateLimiter.check("tabs")) {
                        this.model.state.update((s) => { s.blockedPopupCount++; });
                        break;
                    }
                    const parentTab = this.model.state.get().tabs.find((t) => t.id === internalTabId);
                    this.model.addTab(data.url, parentTab?.groupId);
                    browserUrlChanged.send({ url: data.url });
                }
                break;
            }
            case "popups-blocked": {
                this.model.state.update((s) => { s.blockedPopupCount++; });
                break;
            }
            case "show-find-bar":
                this.openFind();
                break;
            case "hide-find-bar":
                if (this.model.state.get().findBarVisible) {
                    this.closeFind();
                }
                break;
            case "context-menu": {
                const webview = this.webviewRefs.get(internalTabId);
                if (!webview) break;
                await this.handleContextMenu(webview, internalTabId, data);
                break;
            }
        }
    };

    // =====================================================================
    // Context Menu
    // =====================================================================

    private handleContextMenu = async (
        webview: Electron.WebviewTag,
        internalTabId: string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: any,
    ) => {
        await showBrowserContextMenu({
            model: this.model,
            webview,
            internalTabId,
            data,
            showResources: this.showResources,
        });
    };

    // =====================================================================
    // Page Menu (toolbar "..." button)
    // =====================================================================

    /**
     * Build menu items for the toolbar page menu ("..." button).
     * Provides View Source, View Actual DOM, and Show Resources
     * without needing a right-click context menu on the webview.
     */
    getPageMenuItems(): MenuItem[] {
        const state = this.model.state.get();
        const activeTabId = state.activeTabId;
        const tab = state.tabs.find((t) => t.id === activeTabId);
        const webview = this.getActiveWebview();
        const pageUrl = tab?.url || "";
        const hasPage = !!webview && !!pageUrl && pageUrl !== "about:blank";
        const regKey = `${this.model.id}/${activeTabId}`;

        return [
            {
                label: "View Source",
                disabled: !hasPage,
                onClick: async () => {
                    if (!webview) return;
                    const resp = await webview.executeJavaScript(
                        `fetch(location.href).then(r => r.text())`,
                    );
                    pagesModel.addEditorPage("monaco", "html", "Source: " + (tab?.pageTitle || pageUrl), resp);
                },
            },
            {
                label: "View Actual DOM",
                disabled: !hasPage,
                onClick: async () => {
                    const html = await ipcRenderer.invoke(
                        BrowserChannel.collectDom,
                        regKey,
                    );
                    pagesModel.addEditorPage("monaco", "html", "DOM: " + (tab?.pageTitle || pageUrl), html);
                },
            },
            {
                label: "Show Resources",
                disabled: !hasPage,
                onClick: () => this.showResources(regKey, pageUrl, tab?.pageTitle || pageUrl),
            },
        ];
    }

    // =====================================================================
    // Show Resources (shared by context menu and toolbar menu)
    // =====================================================================

    /** Collect DOM resources + network log and open as a link collection. */
    private showResources = async (regKey: string, pageUrl: string, title: string) => {
        const [html, networkLog] = await Promise.all([
            ipcRenderer.invoke(BrowserChannel.collectDom, regKey),
            ipcRenderer.invoke(BrowserChannel.getNetworkLog, regKey),
        ]);

        const { extractHtmlResources } = await import("../../core/utils/html-resources");
        const { networkLogToLinks } = await import("./network-log-links");

        const domLinks = extractHtmlResources(html, { baseUrl: pageUrl });
        const networkLinks = networkLogToLinks(networkLog);
        const links = [...domLinks, ...networkLinks];

        if (links.length === 0) {
            ui.notify("No resources found on this page.", "info");
            return;
        }

        pagesModel.openLinks(links, title + " \u2014 Resources");
    };
}
