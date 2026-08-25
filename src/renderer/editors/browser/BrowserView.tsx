import { memo, useEffect, useRef } from "react";
const { ipcRenderer } = require("electron");
import { EditorToolbar } from "../base/EditorToolbar";
import color from "../../theme/color";
import { Panel, Input, Button, IconButton, Spinner, Text, Dot, Splitter, WithMenu } from "../../uikit";
import { IncognitoIcon, TorIcon } from "../../theme/language-icons";
import { TorStatusOverlay } from "./TorStatusOverlay";
import {
    BrowserEditorModel,
    BrowserTabData,
} from "./BrowserEditorModel";
import {
    BrowserChannel,
    BrowserRegisterRequest,
} from "../../../ipc/browser-ipc";
import { BrowserTabsPanel } from "./BrowserTabsPanel";
import { UrlSuggestionsDropdown } from "./UrlSuggestionsDropdown";
import { BookmarksDrawer } from "./BookmarksDrawer";
import { BrowserSecondaryViews } from "./BrowserSecondaryViews";
import { LinkBody } from "../link-editor/LinkBody";
import { LinkActionBits, LinkBreadcrumbBits } from "../link-editor";
import { BrowserBookmarks } from "./BrowserBookmarks";
import { DownloadButton } from "./DownloadButton";
import { FindBar } from "../shared/FindBar";
import { PageManager } from "../../components/page-manager/PageManager";
import "./BrowserView.css";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const WEBVIEW_PRELOAD_URL = (window as any).webviewPreloadUrl as string;

// ============================================================================
// BrowserWebviewItem — manages a single webview and its IPC registration
// ============================================================================

interface BrowserWebviewItemProps {
    model: BrowserEditorModel;
    tab: BrowserTabData;
    isActive: boolean;
    /** Electron session partition string for this browser page. */
    partition: string;
}

const isBlankUrl = (url: string | undefined) => !url || url === "about:blank";

function BrowserWebviewItemImpl({
    model,
    tab,
    isActive,
    partition,
}: BrowserWebviewItemProps) {
    const webviewRef = useRef<Electron.WebviewTag | null>(null);
    const tabId = model.id;
    const internalTabId = tab.id;

    const initialUrl = useRef(tab.url);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;
        const existing = model.webview.webviewRefs.get(internalTabId);
        if (existing && existing !== webview && existing.isConnected) {
            // Two live mounts for one tab means the previous view tree was
            // abandoned without unmount — its webview keeps a guest renderer
            // process alive. Observed once during US-806; trigger unknown.
            console.warn(
                `[browser] duplicate webview mount for tab ${internalTabId} — ` +
                    "previous webview is still connected (US-806)",
            );
        }
        model.webview.webviewRefs.set(internalTabId, webview);
        return () => {
            model.webview.webviewRefs.delete(internalTabId);
        };
    }, [model, internalTabId]);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;
        const handleFocus = () => {
            document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        };
        webview.addEventListener("focus", handleFocus);
        return () => webview.removeEventListener("focus", handleFocus);
    }, []);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!webview) return;

        let registered = false;

        const onDomReady = () => {
            const currentUrl = webview.getURL();
            if (currentUrl && currentUrl !== "about:blank") {
                model.tabs.currentUrls.set(internalTabId, currentUrl);
            }

            model.webview.webviewReady.add(internalTabId);
            const webContentsId = webview.getWebContentsId();
            const request: BrowserRegisterRequest = {
                tabId,
                internalTabId,
                webContentsId,
            };
            ipcRenderer.send(BrowserChannel.register, request);
            registered = true;

            if (model.state.get().pageMuted) {
                const key = `${tabId}/${internalTabId}`;
                ipcRenderer.send(BrowserChannel.setAudioMuted, key, true);
            }
        };

        webview.addEventListener("dom-ready", onDomReady);

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
                        webview.getURL() || model.tabs.currentUrls.get(internalTabId) || "";
                    model.tabs.cacheFavicon(currentUrl, faviconUrl);
                    model.updateTab(internalTabId, { favicon: faviconUrl });
                    if (!model.state.get().isIncognito && !model.state.get().isTor) {
                        import("../../components/icons/favicon-cache").then(({ getHostname, saveFavicon, consumeFaviconSaveRequest }) => {
                            const hostname = getHostname(currentUrl);
                            if (!hostname) return;
                            if (consumeFaviconSaveRequest(hostname)) {
                                saveFavicon(hostname, faviconUrl);
                                return;
                            }
                            if (model.tabs.bookmarks) {
                                const links = model.tabs.bookmarks.linkEditor.state.get().data.links;
                                const hasLink = links.some((l: { href: string }) => getHostname(l.href) === hostname);
                                if (hasLink) saveFavicon(hostname, faviconUrl);
                            }
                        });
                    }
                }
            } else if (channel === "clicked-images") {
                const imgUrls = args[0] as string[];
                if (Array.isArray(imgUrls) && imgUrls.length > 0) {
                    model.bookmarksUI.trackClickedImages(internalTabId, imgUrls);
                }
            } else if (channel === "show-find-bar") {
                model.webview.openFind();
            } else if (channel === "hide-find-bar") {
                if (model.state.get().findBarVisible) {
                    model.webview.closeFind();
                }
            }
        };

        webview.addEventListener("ipc-message", onIpcMessage);

        const onFoundInPage = (event: Electron.FoundInPageEvent) => {
            if (isActive) {
                model.webview.handleFoundInPage(event.result);
            }
        };
        webview.addEventListener("found-in-page", onFoundInPage);

        return () => {
            model.webview.webviewReady.delete(internalTabId);
            webview.removeEventListener("dom-ready", onDomReady);
            webview.removeEventListener("ipc-message", onIpcMessage);
            webview.removeEventListener("found-in-page", onFoundInPage);
            if (registered) {
                const key = `${tabId}/${internalTabId}`;
                ipcRenderer.send(BrowserChannel.unregister, key);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-per-tab effect (model/tabId/internalTabId are stable for the tab lifetime). Adding `isActive` would tear down and re-register all webview listeners + IPC every time the active tab changes. Theoretical stale-closure on `isActive` inside onFoundInPage is acceptable: found-in-page events only fire during an active find, which typically ends when the user switches tabs.
    }, [model, tabId, internalTabId]);

    return (
        <div data-webview-wrapper>
            <webview
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ref={webviewRef as any}
                src={initialUrl.current}
                style={{
                    backgroundColor: isBlankUrl(tab.url)
                        ? color.background.default
                        : color.background.webview,
                }}
                partition={partition}
                preload={WEBVIEW_PRELOAD_URL}
                // @ts-expect-error -- webview boolean attribute not in React types
                allowpopups="true"
            />
        </div>
    );
}

/** The item reads `tab` only for its id and URL blankness (background color);
 *  navigation and per-event state flow imperatively through the model, so
 *  re-rendering on every tabs[] identity change would only churn the webview
 *  subtree (US-806: browser state updates re-render ~100 components per
 *  navigation event otherwise). */
const BrowserWebviewItem = memo(
    BrowserWebviewItemImpl,
    (prev, next) =>
        prev.model === next.model &&
        prev.partition === next.partition &&
        prev.isActive === next.isActive &&
        prev.tab.id === next.tab.id &&
        isBlankUrl(prev.tab.url) === isBlankUrl(next.tab.url),
);

// ============================================================================
// BlankPageLinks — Shows link editor on empty (about:blank) tabs
// ============================================================================

interface BlankPageLinksProps {
    bookmarks: BrowserBookmarks;
}

/** Memoized: `bookmarks` is a stable per-page model and all children subscribe
 *  to their own state internally, so parent re-renders carry no new inputs. */
const BlankPageLinks = memo(function BlankPageLinks({ bookmarks }: BlankPageLinksProps) {
    return (
        <Panel
            name="blank-page"
            position="absolute" top={0} right={0} bottom={0} left={0} zIndex={3}
            direction="column" background="default"
        >
            <Panel
                name="blank-page-toolbar"
                direction="row" align="center" gap="xs"
                paddingX="md" paddingY="xs" background="dark" borderBottom
                shrink={false} minHeight={32}
            >
                <LinkBreadcrumbBits model={bookmarks.linkEditor} />
                <Panel flex={1} />
                <LinkActionBits model={bookmarks.linkEditor} />
            </Panel>
            <Panel name="blank-page-body" direction="row" flex={1} overflow="hidden">
                <BrowserSecondaryViews host={bookmarks.panelHost} />
                <Panel flex={1} overflow="hidden">
                    <LinkBody model={bookmarks.linkEditor} />
                </Panel>
            </Panel>
        </Panel>
    );
});

// ============================================================================
// URL bar slot helpers
// ============================================================================

function renderUrlStartSlot(
    isTor: boolean,
    torStatus: string,
    isIncognito: boolean,
    showSearchEngineSelector: boolean,
    currentEngineName: string,
    openEngineMenu: (anchor: Element | null) => void,
    model: BrowserEditorModel,
): React.ReactNode {
    const out: React.ReactNode[] = [];
    if (isTor) {
        const dotColor: "success" | "error" | "warning" =
            torStatus === "connected" ? "success" :
            torStatus === "error" ? "error" : "warning";
        out.push(
            <span
                key="tor"
                data-tor-indicator
                onClick={(e) => { e.stopPropagation(); model.toggleTorOverlay(); }}
                title="Tor status"
            >
                {torStatus === "connecting" ? <Spinner size={14} /> : <TorIcon />}
                {torStatus !== "connecting" && (
                    <span data-tor-status-dot><Dot size={6} color={dotColor} /></span>
                )}
            </span>,
        );
    }
    if (isIncognito) {
        out.push(<IncognitoIcon key="incognito" color={color.icon.light} />);
    }
    if (showSearchEngineSelector) {
        out.push(
            <button
                key="se"
                type="button"
                data-search-engine-chip
                onClick={(e) => { e.stopPropagation(); openEngineMenu(e.currentTarget); }}
                title="Change search engine"
            >
                {currentEngineName} ▾
            </button>,
        );
    }
    return out.length ? <>{out}</> : undefined;
}

function renderUrlEndSlot(
    onNavigate: () => void,
    isBookmarked: boolean,
    onStar: () => void,
): React.ReactNode {
    return (
        <>
            <IconButton
                name="url-navigate"
                size="sm"
                icon="arrow-right"
                title="Navigate"
                onClick={onNavigate}
            />
            <IconButton
                name="url-bookmark-toggle"
                size="sm"
                icon={isBookmarked ? "star-filled" : "star"}
                title={isBookmarked ? "Edit Bookmark" : "Add Bookmark"}
                active={isBookmarked}
                onClick={onStar}
            />
        </>
    );
}

// ============================================================================
// BrowserEditorView Component
// ============================================================================

interface BrowserEditorViewProps {
    model: BrowserEditorModel;
}

function BrowserEditorView({ model }: BrowserEditorViewProps) {
    const {
        url, loading, canGoBack, canGoForward,
        tabs, activeTabId, tabsPanelWidth,
        homeUrl, isIncognito, isTor, torStatus, torLog, torOverlayVisible,
        urlInput, suggestionsOpen, hoveredIndex,
        popupOpen, bookmarksOpen, bookmarksWidth,
        bookmarksReady, isBookmarked, blockedPopupCount,
        findBarVisible, findText, findActiveMatch, findTotalMatches,
    } = model.state.use((s) => {
        const activeTab = s.tabs.find((t) => t.id === s.activeTabId);
        return {
            url: s.url,
            loading: s.loading,
            canGoBack: s.canGoBack,
            canGoForward: s.canGoForward,
            tabs: s.tabs,
            activeTabId: s.activeTabId,
            tabsPanelWidth: s.tabsPanelWidth,
            homeUrl: activeTab?.homeUrl ?? "",
            isIncognito: s.isIncognito,
            isTor: s.isTor,
            torStatus: s.torStatus,
            torLog: s.torLog,
            torOverlayVisible: s.torOverlayVisible,
            urlInput: s.urlInput,
            suggestionsOpen: s.suggestionsOpen,
            hoveredIndex: s.hoveredIndex,
            popupOpen: s.popupOpen,
            bookmarksOpen: s.bookmarksOpen,
            bookmarksWidth: s.bookmarksWidth,
            bookmarksReady: s.bookmarksReady,
            isBookmarked: s.isBookmarked,
            blockedPopupCount: s.blockedPopupCount,
            findBarVisible: s.findBarVisible,
            findText: s.findText,
            findActiveMatch: s.findActiveMatch,
            findTotalMatches: s.findTotalMatches,
            searchEngineId: s.searchEngineId,
            userHasTyped: s.userHasTyped,
            searchEntries: s.searchEntries,
        };
    });

    const isInitialLoad = useRef(true);

    useEffect(() => {
        model.webview.initIpcHandler();
        return () => model.webview.disposeIpcHandler();
    }, [model]);

    useEffect(() => {
        model.urlBar.syncFromUrl(url);
    }, [url, model]);

    useEffect(() => {
        if (isInitialLoad.current) {
            isInitialLoad.current = false;
            if (!url || url === "about:blank") {
                setTimeout(() => model.urlBar.focusUrlInput(), 100);
            }
        }
    }, [url, model]);

    const activeTab = tabs.find((t) => t.id === activeTabId);
    useEffect(() => {
        if (activeTab) {
            model.webview.navigateWebview(activeTabId, activeTab.url);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally narrow: re-navigate only when the URL slice or active tab id changes, not on every `activeTab` object identity change (which churns on unrelated tabs[] updates)
    }, [activeTab?.url, activeTabId, model]);

    const { urlBar, bookmarksUI, webview } = model;
    const showSearchEngineSelector = urlBar.showSearchEngineSelector;
    const currentEngineName = urlBar.currentEngineName;
    const searchEngineMenuItems = urlBar.searchEngineMenuItems;
    const suggestionsMode = urlBar.suggestionsMode;
    const suggestionsItems = urlBar.suggestionsItems;

    return (
        <div className="browser-root" onKeyDown={webview.handleKeyDown} tabIndex={-1}>
            <EditorToolbar borderBottom>
                <Panel name="browser-toolbar-content" direction="row" align="center" flex={1} gap="xs">
                    <IconButton
                        name="toolbar-home"
                        size="sm"
                        icon="home"
                        title={homeUrl ? `Go to ${homeUrl}` : "Home"}
                        onClick={model.goHome}
                        disabled={!homeUrl}
                    />
                    <IconButton
                        name="toolbar-back"
                        size="sm"
                        icon="arrow-left"
                        title="Back (Alt+Left)"
                        onClick={webview.goBack}
                        disabled={!canGoBack}
                    />
                    <IconButton
                        name="toolbar-forward"
                        size="sm"
                        icon="arrow-right"
                        title="Forward (Alt+Right)"
                        onClick={webview.goForward}
                        disabled={!canGoForward}
                    />
                    <IconButton
                        name="toolbar-reload"
                        size="sm"
                        icon={loading ? "stop" : "refresh"}
                        title={loading ? "Stop" : "Reload"}
                        onClick={webview.reloadOrStop}
                    />
                    <WithMenu name="search-engine-menu" items={searchEngineMenuItems}>
                        {(openEngineMenu) => (
                            <Panel name="url-bar" flex={1} data-url-bar="">
                                <Input
                                    name="url-input"
                                    ref={urlBar.setUrlInputRef}
                                    size="sm"
                                    value={urlInput}
                                    onChange={urlBar.handleUrlChange}
                                    onKeyDown={urlBar.handleUrlKeyDown}
                                    onFocus={urlBar.handleUrlFocus}
                                    onBlur={urlBar.handleUrlBlur}
                                    onContextMenu={urlBar.handleUrlContextMenu}
                                    placeholder="Enter URL or search term..."
                                    autoComplete="off"
                                    startSlot={renderUrlStartSlot(
                                        isTor, torStatus, isIncognito,
                                        showSearchEngineSelector, currentEngineName,
                                        openEngineMenu, model,
                                    )}
                                    endSlot={renderUrlEndSlot(
                                        urlBar.handleNavigate,
                                        isBookmarked,
                                        bookmarksUI.handleStarClick,
                                    )}
                                />
                            </Panel>
                        )}
                    </WithMenu>
                    <IconButton
                        name="toolbar-bookmarks"
                        size="sm"
                        icon="bookmark"
                        title="Open Bookmarks"
                        onClick={bookmarksUI.handleOpenBookmarks}
                    />
                    {/* US-897 — Tor-only: exit IP / location + Reconnect. */}
                    {isTor && (
                        <IconButton
                            name="toolbar-tor-info"
                            size="sm"
                            icon="question"
                            title="Tor connection info"
                            onClick={model.showTorInfoDialog}
                        />
                    )}
                    <DownloadButton />
                    <WithMenu name="page-menu" items={webview.getPageMenuItems()}>
                        {(openMenu) => (
                            <IconButton
                                name="toolbar-more"
                                size="sm"
                            icon="more-vert"
                                title="Page Menu"
                                onClick={(e) => openMenu(e.currentTarget)}
                            />
                        )}
                    </WithMenu>
                    <IconButton
                        name="toolbar-devtools"
                        size="sm"
                        icon="settings"
                        title="Open DevTools"
                        onClick={webview.openDevTools}
                    />
                    <IconButton
                        name="toolbar-close"
                        size="sm"
                        icon="close"
                        title="Close Tab"
                        onClick={() => model.closeTab(activeTabId)}
                    />
                </Panel>
            </EditorToolbar>
            {loading ? (
                <div data-browser-loading-bar />
            ) : (
                <div style={{ height: 2 }} />
            )}
            {blockedPopupCount > 0 && (
                <Panel
                    name="popup-blocked-bar"
                    direction="row" align="center" gap="md"
                    paddingX="md" paddingY="xs"
                    background="light" borderBottom shrink={false}
                >
                    <Panel flex={1}>
                        <Text size="sm">
                            {blockedPopupCount === 1
                                ? "A popup was blocked on this page"
                                : `${blockedPopupCount} popups were blocked on this page`}
                        </Text>
                    </Panel>
                    <Button
                        name="popup-allow"
                        size="sm"
                        variant="ghost"
                        onClick={model.allowPopups}
                    >
                        Allow
                    </Button>
                    <IconButton
                        name="popup-dismiss"
                        size="sm"
                        icon="close"
                        title="Dismiss"
                        onClick={model.dismissBlockedPopups}
                    />
                </Panel>
            )}
            <Panel
                name="browser-body"
                direction="row" flex={1} overflow="hidden" position="relative"
            >
                <Panel
                    name="tabs-panel-host"
                    shrink={false} overflow="hidden" borderRight
                    width={tabsPanelWidth}
                >
                    <BrowserTabsPanel
                        model={model}
                        tabs={tabs}
                        activeTabId={activeTabId}
                        width={tabsPanelWidth}
                    />
                </Panel>
                <Splitter
                    name="tabs-webview-splitter"
                    orientation="vertical"
                    value={tabsPanelWidth}
                    onChange={model.setTabsPanelWidth}
                    side="before"
                    min={32}
                    background="default"
                    hoverBackground="light"
                    border="none"
                />
                <Panel
                    name="webview-area"
                    flex={1} position="relative" overflow="hidden"
                >
                    <PageManager
                        pageIds={tabs.map((t) => t.id)}
                        activeId={activeTabId}
                        renderPage={(tabId) => {
                            const tab = tabs.find((t) => t.id === tabId);
                            const isBlank = !tab.url || tab.url === "about:blank";
                            return (
                                <>
                                    {isBlank && bookmarksReady && model.tabs.bookmarks && (
                                        <BlankPageLinks bookmarks={model.tabs.bookmarks} />
                                    )}
                                    <BrowserWebviewItem
                                        model={model}
                                        tab={tab}
                                        isActive={tab.id === activeTabId}
                                        partition={model.partition}
                                    />
                                </>
                            );
                        }}
                    />
                    {isTor && torOverlayVisible && (
                        <TorStatusOverlay
                            model={model}
                            torStatus={torStatus}
                            torLog={torLog}
                        />
                    )}
                    {popupOpen && <div data-webview-click-overlay />}
                    {findBarVisible && (
                        <FindBar
                            text={findText}
                            currentMatch={findActiveMatch}
                            totalMatches={findTotalMatches}
                            onTextChange={webview.setFindText}
                            onNext={webview.findNext}
                            onPrev={webview.findPrev}
                            onClose={webview.closeFind}
                            placeholder="Find in page..."
                        />
                    )}
                </Panel>
                {bookmarksReady && model.tabs.bookmarks && (
                    <BookmarksDrawer
                        open={bookmarksOpen}
                        bookmarks={model.tabs.bookmarks}
                        width={bookmarksWidth}
                        onChangeWidth={(w) => model.state.update((s) => { s.bookmarksWidth = w; })}
                        onClose={bookmarksUI.handleCloseBookmarks}
                    />
                )}
            </Panel>
            <UrlSuggestionsDropdown
                anchorEl={urlBar.urlInputRef?.closest('[data-url-bar]') ?? null}
                open={suggestionsOpen}
                items={suggestionsItems}
                mode={suggestionsMode}
                searchText={suggestionsMode === "search" ? urlInput : undefined}
                hoveredIndex={hoveredIndex}
                onHoveredIndexChange={(i) => model.state.update((s) => { s.hoveredIndex = i; })}
                onSelect={urlBar.handleSuggestionSelect}
                onClearVisible={suggestionsMode === "search" ? urlBar.handleClearVisible : undefined}
            />
        </div>
    );
}

export { BrowserEditorView, BrowserEditorModel };
