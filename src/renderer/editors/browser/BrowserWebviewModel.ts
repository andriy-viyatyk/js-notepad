const { ipcRenderer } = require("electron");
import { KeyboardEvent } from "react";
import {
    BrowserChannel,
    BrowserEvent,
} from "../../../ipc/browser-ipc";
import { showAppPopupMenu } from "../../ui/dialogs/poppers/showPopupMenu";
import type { MenuItem } from "../../uikit";
import { pagesModel } from "../../api/pages";
import { ui } from "../../api/ui";

import { globalPopupRateLimiter } from "../../../ipc/popup-rate-limiter";
import { browserUrlChanged } from "../../core/state/events";
import type { BrowserEditorModel } from "./BrowserEditorModel";
import { withTimeout } from "../../core/utils/utils";

/**
 * Budgets for the two context-menu page probes. Both run on the page's own renderer
 * thread, so a loading or busy page can hold them indefinitely; both results are
 * optional, so the menu / dialog opens without them instead of waiting.
 */
const SVG_PROBE_TIMEOUT = 250;
const LINK_PROBE_TIMEOUT = 1000;

/**
 * Manages webview references, IPC event handling, context menu,
 * and keyboard shortcuts for the browser editor.
 */
export class BrowserWebviewModel {
    readonly model: BrowserEditorModel;

    /** Map from internalTabId → webview element. */
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
                const actualUrl = this.model.currentUrls.get(activeTabId) || "";
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

    private handleBrowserEvent = async (
        _event: Electron.IpcRendererEvent,
        browserEvent: BrowserEvent,
    ) => {
        const pageTabId = this.model.id;
        if (browserEvent.tabId !== pageTabId) return;
        const { internalTabId, type, data } = browserEvent;

        switch (type) {
            case "did-navigate": {
                this.model.currentUrls.set(internalTabId, data.url || "");
                if (internalTabId === this.model.state.get().activeTabId) {
                    this.model.urlBar.syncFromUrl(data.url || "");
                    // Close find bar on navigation — search context changed
                    if (this.model.state.get().findBarVisible) {
                        this.closeFind();
                    }
                }
                const cached = this.model.getCachedFavicon(data.url || "");
                this.model.updateTab(internalTabId, {
                    url: data.url,
                    canGoBack: data.canGoBack,
                    canGoForward: data.canGoForward,
                    favicon: cached,
                });
                this.model.addNavHistory(internalTabId, data.url || "");
                this.model.bookmarksUI.shiftTrackedImages(internalTabId);
                if (data.url) browserUrlChanged.send({ url: data.url });
                break;
            }
            case "did-navigate-in-page": {
                this.model.currentUrls.set(internalTabId, data.url || "");
                if (internalTabId === this.model.state.get().activeTabId) {
                    this.model.urlBar.syncFromUrl(data.url || "");
                }
                this.model.updateTab(internalTabId, {
                    url: data.url,
                    canGoBack: data.canGoBack,
                    canGoForward: data.canGoForward,
                });
                this.model.addNavHistory(internalTabId, data.url || "");
                if (data.url) browserUrlChanged.send({ url: data.url });
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
        const menuX = data.x || 0;
        const menuY = data.y || 0;

        const wvRect = webview.getBoundingClientRect();
        const probeX = menuX - wvRect.left;
        const probeY = menuY - wvRect.top;
        // SVG probe — only used to decide whether to include the "Open SVG in Editor" item.
        // `webview.executeJavaScript` queues on the page renderer's main thread; if the page
        // is mid-load and the renderer is busy, awaiting it can block the menu for many
        // seconds. Race against a short budget — on idle pages the probe returns near-
        // instantly; on busy pages we drop the SVG item and open the menu immediately.
        const svgProbe: Promise<string | null> = webview.executeJavaScript(`
            (() => {
                const el = document.elementFromPoint(${probeX}, ${probeY});
                const svg = el?.closest('svg');
                if (!svg) return null;

                const clone = svg.cloneNode(true);

                if (!clone.getAttribute('xmlns')) {
                    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                }

                if (!clone.getAttribute('viewBox')) {
                    try {
                        const bb = svg.getBBox();
                        if (bb.width > 0 && bb.height > 0) {
                            clone.setAttribute('viewBox',
                                bb.x + ' ' + bb.y + ' ' + bb.width + ' ' + bb.height);
                        }
                    } catch (e) {}
                }

                if (!clone.getAttribute('width') && !clone.getAttribute('height')) {
                    const vb = clone.getAttribute('viewBox');
                    if (vb) {
                        const parts = vb.split(/[\\s,]+/);
                        if (parts.length === 4) {
                            clone.setAttribute('width', parts[2]);
                            clone.setAttribute('height', parts[3]);
                        }
                    }
                }

                let html = clone.outerHTML;
                html = html.replace(/<!--[\\s\\S]*?-->/g, '');
                return html;
            })()
        `);
        const svgSource = await withTimeout<string | null>(svgProbe, SVG_PROBE_TIMEOUT, null);

        const items: MenuItem[] = [];

        // Link items
        if (data.linkURL) {
            const linkURL = data.linkURL;
            items.push({
                label: "Open Link in New Tab",
                onClick: () => {
                    const parentTab = this.model.state.get().tabs.find((t) => t.id === internalTabId);
                    this.model.addTab(linkURL, parentTab?.groupId);
                },
            });
            items.push({
                label: "Copy Link Address",
                onClick: () => navigator.clipboard.writeText(linkURL),
            });
            items.push({
                label: "Add to Bookmarks",
                onClick: async () => {
                    const bm = await this.model.bookmarksUI.ensureBookmarks();
                    if (!bm) return;
                    // Same busy-page hazard as the SVG probe above: the title/image are
                    // suggestions only, so open the dialog without them rather than wait.
                    const linkProbe: Promise<{ title: string; imgSrc: string }> = webview.executeJavaScript(`
                        (() => {
                            const el = document.elementFromPoint(${probeX}, ${probeY});
                            const link = el?.closest('a');
                            const img = link?.querySelector('img') || el?.querySelector('img');
                            return {
                                title: link?.textContent?.trim()?.substring(0, 200) || '',
                                imgSrc: img?.src || '',
                            };
                        })()
                    `);
                    // `linkURL` — not `linkInfo` — is what guarantees the dialog always has
                    // a URL; it comes from the context-menu params, never from the page.
                    const linkInfo = await withTimeout(linkProbe, LINK_PROBE_TIMEOUT, {
                        title: "",
                        imgSrc: "",
                    });
                    const existingLink = bm.findByUrl(linkURL);
                    await this.model.bookmarksUI.showBookmarkDialog({
                        title: linkInfo.title,
                        href: linkURL,
                        discoveredImages: linkInfo.imgSrc ? [linkInfo.imgSrc] : [],
                        imgSrc: linkInfo.imgSrc || undefined,
                        existingLink,
                    });
                },
            });
        }

        // Image items
        if (data.srcURL && data.mediaType === "image") {
            const srcURL = data.srcURL;
            items.push({
                label: "Open Image in New Tab",
                startGroup: items.length > 0,
                onClick: async () => {
                    pagesModel.openImageInNewTab(srcURL);
                },
            });
            items.push({
                label: "Copy Image Address",
                onClick: () => navigator.clipboard.writeText(srcURL),
            });
            items.push({
                label: "Use Image for Bookmark",
                onClick: () => {
                    this.model.bookmarksUI.trackClickedImages(internalTabId, [srcURL]);
                },
            });
        }

        // Selection items
        if (data.selectionText) {
            const selectionText = data.selectionText;
            items.push({
                label: "Copy",
                startGroup: items.length > 0,
                onClick: () => {
                    navigator.clipboard.writeText(selectionText);
                    webview.focus();
                },
            });
        }

        // Editable field items
        if (data.isEditable) {
            if (data.editFlags?.canCut) {
                items.push({
                    label: "Cut",
                    startGroup: !data.selectionText && items.length > 0,
                    onClick: () => {
                        webview.focus();
                        webview.cut();
                    },
                });
            }
            if (!data.selectionText && data.editFlags?.canCopy) {
                items.push({
                    label: "Copy",
                    onClick: () => {
                        webview.focus();
                        webview.copy();
                    },
                });
            }
            if (data.editFlags?.canPaste) {
                items.push({
                    label: "Paste",
                    onClick: () => {
                        webview.focus();
                        webview.paste();
                    },
                });
            }
        }

        // Navigation items
        const state = this.model.state.get();
        const tab = state.tabs.find((t) => t.id === internalTabId);
        items.push({
            label: "Back",
            startGroup: true,
            disabled: !tab?.canGoBack,
            onClick: () => webview.goBack(),
        });
        items.push({
            label: "Forward",
            disabled: !tab?.canGoForward,
            onClick: () => webview.goForward(),
        });
        items.push({
            label: "Reload",
            onClick: () => webview.reload(),
        });

        // View Source
        const pageUrl = tab?.url || "";
        items.push({
            label: "View Source",
            startGroup: true,
            disabled: !pageUrl || pageUrl === "about:blank",
            onClick: async () => {
                const resp = await webview.executeJavaScript(
                    `fetch(location.href).then(r => r.text())`,
                );
                pagesModel.addEditorPage("monaco", "html", "Source: " + (tab?.pageTitle || pageUrl), resp);
            },
        });

        // View actual DOM (includes iframe content via main process)
        const regKey = `${this.model.id}/${internalTabId}`;
        items.push({
            label: "View Actual DOM",
            onClick: async () => {
                const html = await ipcRenderer.invoke(
                    BrowserChannel.collectDom,
                    regKey,
                );
                pagesModel.addEditorPage("monaco", "html", "DOM: " + (tab?.pageTitle || pageUrl), html);
            },
        });

        // Show resources extracted from the page DOM + network log
        items.push({
            label: "Show Resources",
            onClick: () => this.showResources(regKey, pageUrl, tab?.pageTitle || pageUrl),
        });

        // SVG item
        if (svgSource) {
            items.push({
                label: "Open SVG in Editor",
                onClick: () => {
                    pagesModel.addEditorPage("monaco", "xml", "untitled.svg", svgSource);
                },
            });
        }

        // Inspect Element
        items.push({
            label: "Inspect Element",
            onClick: () => webview.inspectElement(probeX, probeY),
        });

        this.model.state.update((s) => { s.popupOpen = true; });
        showAppPopupMenu(menuX, menuY, items, {
            skipInspect: true,
        }).then(() => {
            this.model.state.update((s) => { s.popupOpen = false; });
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

        pagesModel.openLinks(links, title + " — Resources");
    };
}
