import styled from "@emotion/styled";
import {
    KeyboardEvent,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
const { ipcRenderer } = require("electron");
import { IPage, PageType } from "../../../shared/types";
import { PageModel, PageToolbar } from "../base";
import { TComponentState } from "../../core/state/state";
import { EditorModule } from "../types";
import color from "../../theme/color";
import { Button } from "../../components/basic/Button";
import { TextField } from "../../components/basic/TextField";
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    PlusIcon,
    RefreshIcon,
    SettingsIcon,
    StopIcon,
} from "../../theme/icons";
import { IncognitoIcon } from "../../theme/language-icons";
import {
    BrowserPageModel,
    BrowserPageState,
    BrowserTabData,
    getDefaultBrowserPageState,
} from "./BrowserPageModel";
import {
    BrowserChannel,
    BrowserEvent,
    BrowserRegisterRequest,
} from "../../../ipc/browser-ipc";
import { Splitter } from "../../components/layout/Splitter";
import { BrowserTabsPanel } from "./BrowserTabsPanel";
import { showAppPopupMenu } from "../../features/dialogs/poppers/showPopupMenu";
import { MenuItem } from "../../components/overlay/PopupMenu";
import { pagesModel } from "../../store/pages-store";
import { newTextFileModel } from "../text/TextPageModel";
import type { ImageViewerModelState } from "../image/ImageViewer";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WEBVIEW_PRELOAD_URL = (window as any).webviewPreloadUrl as string;

// ============================================================================
// Styled Component
// ============================================================================

const BrowserPageViewRoot = styled.div({
    flex: "1 1 auto",
    display: "flex",
    flexDirection: "column",
    outline: "none",
    overflow: "hidden",

    "& .browser-toolbar-content": {
        display: "flex",
        alignItems: "center",
        flex: 1,
        gap: 4,
    },

    "& .url-bar": {
        flex: 1,
    },

    "& .loading-bar": {
        height: 2,
        backgroundColor: color.border.active,
        animation: "loading-pulse 1.5s ease-in-out infinite",
    },

    "& .loading-bar-placeholder": {
        height: 2,
    },

    "& .browser-body": {
        flex: "1 1 auto",
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
    },

    "& .webview-area": {
        flex: "1 1 auto",
        display: "flex",
        position: "relative",
        overflow: "hidden",
    },

    "& .webview-wrapper": {
        position: "absolute",
        inset: 0,
        display: "flex",
        "&.hidden": {
            visibility: "hidden",
            pointerEvents: "none",
        },
        "& webview": {
            flex: "1 1 auto",
            border: "none",
        },
    },

    "& .webview-click-overlay": {
        position: "absolute",
        inset: 0,
        zIndex: 1,
    },

    "& .tabs-panel": {
        flexShrink: 0,
        overflow: "hidden",
    },

    "@keyframes loading-pulse": {
        "0%": { opacity: 0.3 },
        "50%": { opacity: 1 },
        "100%": { opacity: 0.3 },
    },
});

// ============================================================================
// BrowserWebviewItem — manages a single webview and its IPC registration
// ============================================================================

interface BrowserWebviewItemProps {
    model: BrowserPageModel;
    tab: BrowserTabData;
    isActive: boolean;
    /** Electron session partition string for this browser page. */
    partition: string;
    /** Map from internalTabId → webview ref, kept in parent for toolbar operations */
    webviewRefs: React.RefObject<Map<string, Electron.WebviewTag>>;
    /** Set of internalTabIds whose webview has fired dom-ready */
    webviewReady: React.RefObject<Set<string>>;
}

function BrowserWebviewItem({
    model,
    tab,
    isActive,
    partition,
    webviewRefs,
    webviewReady,
}: BrowserWebviewItemProps) {
    const webviewRef = useRef<Electron.WebviewTag | null>(null);
    const tabId = model.id;
    const internalTabId = tab.id;

    // Track initial src — we only set src on mount, not on re-render
    const initialUrl = useRef(tab.url);

    // Store webview ref for parent access immediately (not waiting for dom-ready).
    // about:blank may not fire dom-ready, so toolbar operations (loadURL, devtools)
    // need the ref available right away.
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;
        webviewRefs.current.set(internalTabId, webview);
        return () => {
            webviewRefs.current.delete(internalTabId);
        };
    }, [internalTabId, webviewRefs]);

    // Register with main process on dom-ready and listen for preload messages
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        let registered = false;

        const onDomReady = () => {
            webviewReady.current.add(internalTabId);
            const webContentsId = webview.getWebContentsId();
            const request: BrowserRegisterRequest = {
                tabId,
                internalTabId,
                webContentsId,
            };
            ipcRenderer.send(BrowserChannel.register, request);
            registered = true;
        };

        webview.addEventListener("dom-ready", onDomReady);

        // Handle messages from the webview preload script (title, favicon)
        const onIpcMessage = (event: Electron.IpcMessageEvent) => {
            const { channel, args } = event;
            if (channel === "page-title") {
                const title = args[0] as string;
                if (title) {
                    model.updateTab(internalTabId, { pageTitle: title });
                }
            } else if (channel === "page-favicon") {
                const faviconUrl = args[0] as string;
                if (faviconUrl) {
                    const currentUrl =
                        model.currentUrls.get(internalTabId) || "";
                    model.cacheFavicon(currentUrl, faviconUrl);
                    model.updateTab(internalTabId, { favicon: faviconUrl });
                }
            }
        };

        webview.addEventListener("ipc-message", onIpcMessage);

        return () => {
            webviewReady.current.delete(internalTabId);
            webview.removeEventListener("dom-ready", onDomReady);
            webview.removeEventListener("ipc-message", onIpcMessage);
            if (registered) {
                const key = `${tabId}/${internalTabId}`;
                ipcRenderer.send(BrowserChannel.unregister, key);
            }
        };
        // Note: tab.url is intentionally excluded — this effect manages IPC
        // registration which doesn't depend on URL changes. Including it would
        // cause webviewReady to be cleared on every navigation, breaking loadURL.
    }, [model, tabId, internalTabId, webviewRefs, webviewReady]);

    return (
        <div className={`webview-wrapper${isActive ? "" : " hidden"}`}>
            <webview
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={webviewRef as any}
                src={initialUrl.current}
                style={{
                    backgroundColor:
                        !tab.url || tab.url === "about:blank"
                            ? color.background.default
                            : "#ffffff",
                }}
                partition={partition}
                preload={WEBVIEW_PRELOAD_URL}
                // Allow popups so setWindowOpenHandler fires for target="_blank" links.
                // The main process handler denies the popup and relays the URL as a
                // "new-window" event, which opens it in a new internal tab.
                // @ts-expect-error -- webview boolean attribute not in React types
                allowpopups="true"
            />
        </div>
    );
}

// ============================================================================
// BrowserPageView Component
// ============================================================================

interface BrowserPageViewProps {
    model: BrowserPageModel;
}

function BrowserPageView({ model }: BrowserPageViewProps) {
    const { url, loading, canGoBack, canGoForward, tabs, activeTabId, tabsPanelWidth } =
        model.state.use((s) => ({
            url: s.url,
            loading: s.loading,
            canGoBack: s.canGoBack,
            canGoForward: s.canGoForward,
            tabs: s.tabs,
            activeTabId: s.activeTabId,
            tabsPanelWidth: s.tabsPanelWidth,
        }));

    const [urlInput, setUrlInput] = useState(url);
    const urlInputRef = useRef<HTMLInputElement>(null);
    const isInitialLoad = useRef(true);
    const webviewRefs = useRef<Map<string, Electron.WebviewTag>>(new Map());
    /** Tracks which internal tabs have fired dom-ready (safe to call loadURL). */
    const webviewReady = useRef<Set<string>>(new Set());
    /** When true, a transparent overlay covers the webview area so clicks
     *  fire on the renderer DOM and dismiss the open popup menu. */
    const [popupOpen, setPopupOpen] = useState(false);

    // Keep urlInput in sync when URL changes externally (navigation, tab switch)
    useEffect(() => {
        setUrlInput(url);
    }, [url]);

    // Global IPC event handler — routes events to the correct internal tab
    useEffect(() => {
        const pageTabId = model.id;

        const onBrowserEvent = async (
            _event: Electron.IpcRendererEvent,
            browserEvent: BrowserEvent,
        ) => {
            if (browserEvent.tabId !== pageTabId) return;
            const { internalTabId, type, data } = browserEvent;

            switch (type) {
                case "did-navigate": {
                    model.currentUrls.set(internalTabId, data.url || "");
                    // Update urlInput only if this is the active tab
                    if (internalTabId === model.state.get().activeTabId) {
                        setUrlInput(data.url || "");
                    }
                    const cached = model.getCachedFavicon(data.url || "");
                    // Update tab.url so it reflects reality (prevents
                    // stale URL reload when switching tabs)
                    model.updateTab(internalTabId, {
                        url: data.url,
                        canGoBack: data.canGoBack,
                        canGoForward: data.canGoForward,
                        favicon: cached,
                    });
                    break;
                }
                case "did-navigate-in-page": {
                    model.currentUrls.set(internalTabId, data.url || "");
                    if (internalTabId === model.state.get().activeTabId) {
                        setUrlInput(data.url || "");
                    }
                    model.updateTab(internalTabId, {
                        url: data.url,
                        canGoBack: data.canGoBack,
                        canGoForward: data.canGoForward,
                    });
                    break;
                }
                case "did-start-loading":
                    model.updateTab(internalTabId, { loading: true });
                    break;
                case "did-stop-loading":
                    model.updateTab(internalTabId, { loading: false });
                    break;
                case "did-start-navigation": {
                    if (data.blocked) {
                        const webview = webviewRefs.current.get(internalTabId);
                        const tabData = model.state
                            .get()
                            .tabs.find((t) => t.id === internalTabId);
                        if (webview && tabData && tabData.url !== data.url) {
                            webview.goBack();
                        }
                    }
                    break;
                }
                case "new-window": {
                    // Open the URL in a new internal tab
                    if (data.url) {
                        model.addTab(data.url);
                    }
                    break;
                }
                case "context-menu": {
                    const webview = webviewRefs.current.get(internalTabId);
                    if (!webview) break;

                    // params.x/y from the webview context-menu event are
                    // already in the host window's coordinate space.
                    const menuX = data.x || 0;
                    const menuY = data.y || 0;

                    // Probe whether the click target is inside an SVG element.
                    // Uses webview-relative coordinates for elementFromPoint.
                    const wvRect = webview.getBoundingClientRect();
                    const probeX = menuX - wvRect.left;
                    const probeY = menuY - wvRect.top;
                    const svgSource: string | null = await webview.executeJavaScript(`
                        (() => {
                            const el = document.elementFromPoint(${probeX}, ${probeY});
                            const svg = el?.closest('svg');
                            if (!svg) return null;

                            // Clone so we don't mutate the live DOM
                            const clone = svg.cloneNode(true);

                            // Add xmlns if missing (required for standalone SVG)
                            if (!clone.getAttribute('xmlns')) {
                                clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                            }

                            // Add viewBox if missing — use getBBox() for the coordinate space
                            if (!clone.getAttribute('viewBox')) {
                                try {
                                    const bb = svg.getBBox();
                                    if (bb.width > 0 && bb.height > 0) {
                                        clone.setAttribute('viewBox',
                                            bb.x + ' ' + bb.y + ' ' + bb.width + ' ' + bb.height);
                                    }
                                } catch (e) {}
                            }

                            // Set width/height if missing so it has intrinsic size
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

                            // Strip HTML comments (framework artifacts like Vue's <!--[-->)
                            let html = clone.outerHTML;
                            html = html.replace(/<!--[\\s\\S]*?-->/g, '');
                            return html;
                        })()
                    `);

                    const items: MenuItem[] = [];

                    // Link items
                    if (data.linkURL) {
                        const linkURL = data.linkURL;
                        items.push({
                            label: "Open Link in New Tab",
                            onClick: () => model.addTab(linkURL),
                        });
                        items.push({
                            label: "Copy Link Address",
                            onClick: () => navigator.clipboard.writeText(linkURL),
                        });
                    }

                    // Image items
                    if (data.srcURL && data.mediaType === "image") {
                        const srcURL = data.srcURL;
                        items.push({
                            label: "Open Image in New Tab",
                            startGroup: items.length > 0,
                            onClick: async () => {
                                const imgModule = await import("../image/ImageViewer");
                                const imgModel = await imgModule.default.newEmptyPageModel("imageFile");
                                if (imgModel) {
                                    imgModel.state.update((s: ImageViewerModelState) => {
                                        s.title = srcURL.split("/").pop()?.split("?")[0] || "Image";
                                        s.url = srcURL;
                                    });
                                    await imgModel.restore();
                                    pagesModel.addPage(imgModel);
                                }
                            },
                        });
                        items.push({
                            label: "Copy Image Address",
                            onClick: () => navigator.clipboard.writeText(srcURL),
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
                    const state = model.state.get();
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

                    // View Source (raw HTML from server)
                    const pageUrl = tab?.url || "";
                    items.push({
                        label: "View Source",
                        startGroup: true,
                        disabled: !pageUrl || pageUrl === "about:blank",
                        onClick: async () => {
                            const resp = await webview.executeJavaScript(
                                `fetch(location.href).then(r => r.text())`,
                            );
                            const page = newTextFileModel();
                            page.state.update((s) => {
                                s.title = "Source: " + (tab?.pageTitle || pageUrl);
                                s.language = "html";
                                s.content = resp;
                            });
                            page.restore();
                            pagesModel.addPage(page as unknown as PageModel);
                        },
                    });

                    // View actual DOM (live rendered DOM)
                    items.push({
                        label: "View Actual DOM",
                        onClick: async () => {
                            const html = await webview.executeJavaScript(
                                "document.documentElement.outerHTML",
                            );
                            const page = newTextFileModel();
                            page.state.update((s) => {
                                s.title = "DOM: " + (tab?.pageTitle || pageUrl);
                                s.language = "html";
                                s.content = html;
                            });
                            page.restore();
                            pagesModel.addPage(page as unknown as PageModel);
                        },
                    });

                    // SVG item — only when right-click target is inside an <svg>
                    if (svgSource) {
                        items.push({
                            label: "Open SVG in Editor",
                            onClick: () => {
                                const page = newTextFileModel();
                                page.state.update((s) => {
                                    s.title = "untitled.svg";
                                    s.language = "xml";
                                    s.content = svgSource;
                                });
                                page.restore();
                                pagesModel.addPage(page as unknown as PageModel);
                            },
                        });
                    }

                    // Inspect Element — probeX/probeY are already webview-relative
                    items.push({
                        label: "Inspect Element",
                        onClick: () => webview.inspectElement(probeX, probeY),
                    });

                    setPopupOpen(true);
                    showAppPopupMenu(menuX, menuY, items, {
                        skipInspect: true,
                    }).then(() => {
                        setPopupOpen(false);
                    });
                    break;
                }
            }
        };

        ipcRenderer.on(BrowserChannel.event, onBrowserEvent);
        return () => {
            ipcRenderer.removeListener(BrowserChannel.event, onBrowserEvent);
        };
    }, [model]);

    // Focus URL bar on initial load when URL is blank
    useEffect(() => {
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            if (!url || url === "about:blank") {
                setTimeout(() => urlInputRef.current?.focus(), 100);
            }
        }
    }, [url]);

    // Get the active tab's webview for toolbar operations
    const getActiveWebview = useCallback((): Electron.WebviewTag | undefined => {
        return webviewRefs.current.get(activeTabId);
    }, [activeTabId]);

    const handleUrlKeyDown = useCallback(
        (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === "Enter") {
                e.preventDefault();
                model.navigate(urlInput);
                urlInputRef.current?.blur();
            } else if (e.key === "Escape") {
                setUrlInput(url);
                urlInputRef.current?.blur();
            }
        },
        [model, urlInput, url],
    );

    const handleNavigate = useCallback(() => {
        model.navigate(urlInput);
        urlInputRef.current?.blur();
    }, [model, urlInput]);

    const handleUrlContextMenu = useCallback(
        (e: React.MouseEvent) => {
            if (!e.nativeEvent.menuItems) {
                e.nativeEvent.menuItems = [];
            }
            e.nativeEvent.menuItems.push({
                label: "Paste and Go",
                startGroup: true,
                onClick: async () => {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        setUrlInput(text);
                        model.navigate(text);
                    }
                },
            });
        },
        [model],
    );

    const handleUrlFocus = useCallback(() => {
        setTimeout(() => urlInputRef.current?.select(), 0);
    }, []);

    const handleGoBack = useCallback(() => {
        getActiveWebview()?.goBack();
    }, [getActiveWebview]);

    const handleGoForward = useCallback(() => {
        getActiveWebview()?.goForward();
    }, [getActiveWebview]);

    const handleReloadOrStop = useCallback(() => {
        const wv = getActiveWebview();
        if (!wv) return;
        if (loading) {
            wv.stop();
        } else {
            wv.reload();
        }
    }, [loading, getActiveWebview]);

    const handleOpenDevTools = useCallback(() => {
        getActiveWebview()?.openDevTools();
    }, [getActiveWebview]);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLDivElement>) => {
            if (e.ctrlKey && e.key === "l") {
                e.preventDefault();
                urlInputRef.current?.focus();
            }
            if (e.ctrlKey && e.key === "f") {
                e.preventDefault();
                const webview = getActiveWebview();
                if (webview) {
                    const term = prompt("Find in page:");
                    if (term) {
                        webview.findInPage(term);
                    } else {
                        webview.stopFindInPage("clearSelection");
                    }
                }
            }
        },
        [getActiveWebview],
    );

    const handleNewTab = useCallback(() => {
        model.addTab();
    }, [model]);

    const handleTabsPanelWidthChange = useCallback(
        (width: number) => {
            model.setTabsPanelWidth(width);
        },
        [model],
    );

    // Navigate active tab's webview when url changes (user typed in URL bar)
    const activeTab = useMemo(
        () => tabs.find((t) => t.id === activeTabId),
        [tabs, activeTabId],
    );
    const prevActiveUrl = useRef(activeTab?.url || "");

    useEffect(() => {
        if (!activeTab) return;
        const newUrl = activeTab.url;
        if (newUrl !== prevActiveUrl.current && newUrl !== "about:blank") {
            const webview = webviewRefs.current.get(activeTabId);
            // Only call loadURL after the webview has fired dom-ready.
            // New tabs already get their URL via the src attribute; calling
            // loadURL before dom-ready crashes the app.
            if (webview && webviewReady.current.has(activeTabId)) {
                const actualUrl = model.currentUrls.get(activeTabId) || "";
                if (actualUrl !== newUrl) {
                    webview.loadURL(newUrl);
                }
            }
        }
        prevActiveUrl.current = newUrl;
    }, [activeTab?.url, activeTabId, model]);

    return (
        <BrowserPageViewRoot onKeyDown={handleKeyDown} tabIndex={-1}>
            <PageToolbar borderBottom>
                <div className="browser-toolbar-content">
                    <Button
                        type="icon"
                        size="small"
                        title="Back (Alt+Left)"
                        onClick={handleGoBack}
                        disabled={!canGoBack}
                    >
                        <ArrowLeftIcon />
                    </Button>
                    <Button
                        type="icon"
                        size="small"
                        title="Forward (Alt+Right)"
                        onClick={handleGoForward}
                        disabled={!canGoForward}
                    >
                        <ArrowRightIcon />
                    </Button>
                    <Button
                        type="icon"
                        size="small"
                        title={loading ? "Stop" : "Reload"}
                        onClick={handleReloadOrStop}
                    >
                        {loading ? <StopIcon /> : <RefreshIcon />}
                    </Button>
                    <TextField
                        ref={urlInputRef}
                        className="url-bar"
                        value={urlInput}
                        onChange={setUrlInput}
                        onKeyDown={handleUrlKeyDown}
                        onFocus={handleUrlFocus}
                        onContextMenu={handleUrlContextMenu}
                        placeholder="Enter URL or search term..."
                        startButtons={model.state.get().isIncognito ? [
                            <IncognitoIcon key="incognito" color={color.icon.light} />,
                        ] : undefined}
                        endButtons={[
                            <Button
                                key="go"
                                size="small"
                                type="icon"
                                title="Navigate"
                                onClick={handleNavigate}
                            >
                                <ArrowRightIcon />
                            </Button>,
                        ]}
                    />
                    <Button
                        type="icon"
                        size="small"
                        title="New Tab"
                        onClick={handleNewTab}
                    >
                        <PlusIcon />
                    </Button>
                    <Button
                        type="icon"
                        size="small"
                        title="Open DevTools"
                        onClick={handleOpenDevTools}
                    >
                        <SettingsIcon />
                    </Button>
                </div>
            </PageToolbar>
            {loading ? (
                <div className="loading-bar" />
            ) : (
                <div className="loading-bar-placeholder" />
            )}
            <div className="browser-body">
                <div
                    className="tabs-panel"
                    style={{ width: tabsPanelWidth }}
                >
                    <BrowserTabsPanel
                        model={model}
                        tabs={tabs}
                        activeTabId={activeTabId}
                        width={tabsPanelWidth}
                    />
                </div>
                <Splitter
                    type="vertical"
                    initialWidth={tabsPanelWidth}
                    onChangeWidth={handleTabsPanelWidthChange}
                    borderSized="right"
                />
                <div className="webview-area">
                    {tabs.map((tab) => (
                        <BrowserWebviewItem
                            key={tab.id}
                            model={model}
                            tab={tab}
                            isActive={tab.id === activeTabId}
                            partition={model.partition}
                            webviewRefs={webviewRefs}
                            webviewReady={webviewReady}
                        />
                    ))}
                    {popupOpen && <div className="webview-click-overlay" />}
                </div>
            </div>
        </BrowserPageViewRoot>
    );
}

// ============================================================================
// EditorModule
// ============================================================================

const browserEditorModule: EditorModule = {
    Editor: BrowserPageView as any,
    newPageModel: async () => {
        return new BrowserPageModel(
            new TComponentState(getDefaultBrowserPageState()),
        );
    },
    newEmptyPageModel: async (
        pageType: PageType,
    ): Promise<PageModel | null> => {
        if (pageType !== "browserPage") return null;
        const model = new BrowserPageModel(
            new TComponentState(getDefaultBrowserPageState()),
        );
        return model;
    },
    newPageModelFromState: async (
        state: Partial<IPage>,
    ): Promise<PageModel> => {
        const initialState: BrowserPageState = {
            ...getDefaultBrowserPageState(),
            ...(state as Partial<BrowserPageState>),
        };
        return new BrowserPageModel(new TComponentState(initialState));
    },
};

export default browserEditorModule;
export { BrowserPageView, BrowserPageModel };
