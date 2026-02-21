import styled from "@emotion/styled";
import {
    KeyboardEvent,
    useCallback,
    useEffect,
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
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    RefreshIcon,
    SettingsIcon,
    StopIcon,
} from "../../theme/icons";
import {
    BrowserPageModel,
    BrowserPageState,
    getDefaultBrowserPageState,
} from "./BrowserPageModel";
import {
    BrowserChannel,
    BrowserEvent,
    BrowserRegisterRequest,
} from "../../../ipc/browser-ipc";

const BROWSER_PARTITION = "persist:browser-default";
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
        height: 24,
        border: `1px solid ${color.border.default}`,
        borderRadius: 4,
        padding: "0 8px",
        fontSize: 13,
        backgroundColor: color.background.default,
        color: color.text.default,
        outline: "none",
        fontFamily: "inherit",
        "&:focus": {
            borderColor: color.border.active,
        },
    },

    "& .loading-bar": {
        height: 2,
        backgroundColor: color.border.active,
        animation: "loading-pulse 1.5s ease-in-out infinite",
    },

    "& .loading-bar-placeholder": {
        height: 2,
    },

    "& .webview-container": {
        flex: "1 1 auto",
        display: "flex",
        position: "relative",

        "& webview": {
            flex: "1 1 auto",
            border: "none",
        },
    },

    "@keyframes loading-pulse": {
        "0%": { opacity: 0.3 },
        "50%": { opacity: 1 },
        "100%": { opacity: 0.3 },
    },
});

// ============================================================================
// BrowserPageView Component
// ============================================================================

interface BrowserPageViewProps {
    model: BrowserPageModel;
}

function BrowserPageView({ model }: BrowserPageViewProps) {
    const { url, loading, canGoBack, canGoForward } = model.state.use(
        (s) => ({
            url: s.url,
            loading: s.loading,
            canGoBack: s.canGoBack,
            canGoForward: s.canGoForward,
        }),
    );

    const [urlInput, setUrlInput] = useState(url);
    const webviewRef = useRef<Electron.WebviewTag | null>(null);
    const urlInputRef = useRef<HTMLInputElement>(null);
    const isInitialLoad = useRef(true);

    // Keep urlInput in sync when URL changes externally (navigation within webview)
    useEffect(() => {
        setUrlInput(url);
    }, [url]);

    // Register webview with main process and listen for IPC events
    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        const tabId = model.id;
        let registered = false;

        // Handle IPC events from main process (navigation state, loading, protocol blocking)
        const onBrowserEvent = (_event: Electron.IpcRendererEvent, browserEvent: BrowserEvent) => {
            if (browserEvent.tabId !== tabId) return;
            const { type, data } = browserEvent;

            switch (type) {
                case "did-navigate": {
                    // Update currentUrl and URL bar directly — do NOT update
                    // state.url to avoid React re-setting the webview src attribute
                    // which causes ERR_ABORTED double-navigation.
                    model.currentUrl = data.url || "";
                    setUrlInput(data.url || "");
                    const cached = model.getCachedFavicon(data.url || "");
                    model.updateFromWebview({
                        canGoBack: data.canGoBack,
                        canGoForward: data.canGoForward,
                        favicon: cached,
                    });
                    break;
                }
                case "did-navigate-in-page":
                    model.currentUrl = data.url || "";
                    setUrlInput(data.url || "");
                    model.updateFromWebview({
                        canGoBack: data.canGoBack,
                        canGoForward: data.canGoForward,
                    });
                    break;
                case "did-start-loading":
                    model.updateFromWebview({ loading: true });
                    break;
                case "did-stop-loading":
                    model.updateFromWebview({ loading: false });
                    break;
                case "did-start-navigation":
                    if (data.blocked) {
                        if (model.state.get().url !== data.url) {
                            webview.goBack();
                        }
                    }
                    break;
            }
        };

        ipcRenderer.on(BrowserChannel.event, onBrowserEvent);

        // Register after dom-ready so webContentsId is available
        const onDomReady = () => {
            const webContentsId = webview.getWebContentsId();
            const request: BrowserRegisterRequest = {
                tabId,
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
                    model.updateFromWebview({ pageTitle: title });
                }
            } else if (channel === "page-favicon") {
                const faviconUrl = args[0] as string;
                if (faviconUrl) {
                    model.cacheFavicon(model.currentUrl || model.state.get().url, faviconUrl);
                    model.updateFromWebview({ favicon: faviconUrl });
                }
            }
        };

        webview.addEventListener("ipc-message", onIpcMessage);

        return () => {
            ipcRenderer.removeListener(BrowserChannel.event, onBrowserEvent);
            webview.removeEventListener("dom-ready", onDomReady);
            webview.removeEventListener("ipc-message", onIpcMessage);
            if (registered) {
                ipcRenderer.send(BrowserChannel.unregister, tabId);
            }
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

    const handleUrlFocus = useCallback(() => {
        setTimeout(() => urlInputRef.current?.select(), 0);
    }, []);

    const handleGoBack = useCallback(() => {
        webviewRef.current?.goBack();
    }, []);

    const handleGoForward = useCallback(() => {
        webviewRef.current?.goForward();
    }, []);

    const handleReloadOrStop = useCallback(() => {
        if (loading) {
            webviewRef.current?.stop();
        } else {
            webviewRef.current?.reload();
        }
    }, [loading]);

    const handleOpenDevTools = useCallback(() => {
        webviewRef.current?.openDevTools();
    }, []);

    const handleKeyDown = useCallback(
        (e: KeyboardEvent<HTMLDivElement>) => {
            if (e.ctrlKey && e.key === "l") {
                e.preventDefault();
                urlInputRef.current?.focus();
            }
            if (e.ctrlKey && e.key === "f") {
                e.preventDefault();
                const webview = webviewRef.current;
                if (webview) {
                    // Simple find-in-page: prompt for search term
                    // A proper find bar would be better, but this is functional
                    const term = prompt("Find in page:");
                    if (term) {
                        webview.findInPage(term);
                    } else {
                        webview.stopFindInPage("clearSelection");
                    }
                }
            }
        },
        [],
    );

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
                    <input
                        ref={urlInputRef}
                        className="url-bar"
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        onKeyDown={handleUrlKeyDown}
                        onFocus={handleUrlFocus}
                        placeholder="Enter URL or search term..."
                        spellCheck={false}
                    />
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
            <div className="webview-container">
                <webview
                    ref={webviewRef as any}
                    src={url}
                    partition={BROWSER_PARTITION}
                    preload={WEBVIEW_PRELOAD_URL}
                />
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
