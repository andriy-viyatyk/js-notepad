import { IEditorState } from "../../../shared/types";
import { TorStatus } from "../../../ipc/tor-ipc";
import { getDefaultEditorModelState } from "../base";

// ============================================================================
// Search Engines
// ============================================================================

export interface SearchEngine {
    id: string;
    label: string;
    /** URL template — `%s` is replaced with the encoded search query. */
    searchUrl: string;
    /** Hostname(s) that identify this engine in the URL bar. */
    hosts: string[];
    /** URL search param that contains the query (e.g. "q" for Google). */
    queryParam: string;
    /** Optional path prefix to detect this engine even when query param is missing
     *  (e.g. Perplexity redirects `/search?q=foo` to `/search/foo-<hash>`). */
    searchPathPrefix?: string;
}

export const SEARCH_ENGINES: SearchEngine[] = [
    {
        id: "google",
        label: "Google",
        searchUrl: "https://www.google.com/search?q=%s",
        hosts: ["www.google.com", "google.com"],
        queryParam: "q",
    },
    {
        id: "bing",
        label: "Bing",
        searchUrl: "https://www.bing.com/search?q=%s",
        hosts: ["www.bing.com", "bing.com"],
        queryParam: "q",
    },
    {
        id: "duckduckgo",
        label: "DuckDuckGo",
        searchUrl: "https://duckduckgo.com/?q=%s",
        hosts: ["duckduckgo.com", "www.duckduckgo.com"],
        queryParam: "q",
    },
    {
        id: "yahoo",
        label: "Yahoo",
        searchUrl: "https://search.yahoo.com/search?p=%s",
        hosts: ["search.yahoo.com"],
        queryParam: "p",
    },
    {
        id: "ecosia",
        label: "Ecosia",
        searchUrl: "https://www.ecosia.org/search?q=%s",
        hosts: ["www.ecosia.org", "ecosia.org"],
        queryParam: "q",
    },
    {
        id: "brave",
        label: "Brave",
        searchUrl: "https://search.brave.com/search?q=%s",
        hosts: ["search.brave.com"],
        queryParam: "q",
    },
    {
        id: "startpage",
        label: "Startpage",
        searchUrl: "https://www.startpage.com/sp/search?query=%s",
        hosts: ["www.startpage.com", "startpage.com"],
        queryParam: "query",
    },
    {
        id: "qwant",
        label: "Qwant",
        searchUrl: "https://www.qwant.com/?q=%s",
        hosts: ["www.qwant.com", "qwant.com"],
        queryParam: "q",
    },
    {
        id: "baidu",
        label: "Baidu",
        searchUrl: "https://www.baidu.com/s?wd=%s",
        hosts: ["www.baidu.com", "baidu.com"],
        queryParam: "wd",
    },
    {
        id: "perplexity",
        label: "Perplexity",
        searchUrl: "https://www.perplexity.ai/search?q=%s",
        hosts: ["www.perplexity.ai", "perplexity.ai"],
        queryParam: "q",
        searchPathPrefix: "/search",
    },
    {
        id: "gibiru",
        label: "Gibiru",
        searchUrl: "https://gibiru.com/results.html?q=%s",
        hosts: ["gibiru.com", "www.gibiru.com"],
        queryParam: "q",
    },
];

/** Try to detect a search engine from a URL and extract the query string. */
export function detectSearchEngine(url: string): { engine: SearchEngine; query: string } | null {
    try {
        const parsed = new URL(url);
        for (const engine of SEARCH_ENGINES) {
            if (engine.hosts.includes(parsed.hostname)) {
                const query = parsed.searchParams.get(engine.queryParam);
                if (query) {
                    return { engine, query };
                }
                // Fallback: some engines redirect to a path-based URL (e.g. Perplexity
                // rewrites /search?q=foo → /search/foo-<hash>). Detect by path prefix.
                if (engine.searchPathPrefix && parsed.pathname.startsWith(engine.searchPathPrefix)) {
                    return { engine, query: "" };
                }
            }
        }
    } catch {
        // Invalid URL
    }
    return null;
}

/** State for a single internal browser tab. */
export interface BrowserTabData {
    id: string;
    url: string;
    pageTitle: string;
    loading: boolean;
    canGoBack: boolean;
    canGoForward: boolean;
    favicon: string;
    /** Whether the webview is currently emitting audio. */
    audible: boolean;
    /** Whether the webview is muted by the user. */
    muted: boolean;
    /** The "home" URL for this tab — set on user-initiated navigation or tab creation with a URL. */
    homeUrl: string;
    /** Navigation history for this tab — most recent URL first. */
    navHistory: string[];
    /** Tab group ID — tabs opened from the same parent share a group. */
    groupId: string;
}

export interface BrowserEditorState extends IEditorState {
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
    /** Whether this is a Tor browsing session. */
    isTor: boolean;
    /** Tor connection status. */
    torStatus: TorStatus;
    /** Accumulated Tor log text (stdout from tor.exe). */
    torLog: string;
    /** Whether the Tor status overlay is visible. */
    torOverlayVisible: boolean;
    /** Page-level mute — mutes all internal tabs. */
    pageMuted: boolean;
    /** True if any internal tab is currently emitting audio (for PageTab icon). */
    _anyTabAudible: boolean;
    /** Selected search engine ID (default: "google"). */
    searchEngineId: string;
    /** Last search query typed by the user (used when switching engines on path-based URLs). */
    lastSearchQuery: string;

    // -- Ephemeral state (managed by sub-models, not persisted) --

    /**
     * True when an agent (MCP tool or MCP-run script) opened this page. Agents are blocked from
     * incognito/Tor pages the *user* opened; a private page the agent opened itself is its own to
     * read and drive. Deliberately not persisted: after a restart the page counts as the user's.
     */
    openedByAgent: boolean;
    /** Current text in URL input (managed by BrowserUrlBarModel). */
    urlInput: string;
    /** Whether the URL suggestions dropdown is visible. */
    suggestionsOpen: boolean;
    /** Whether the user has typed in the URL bar (vs just focused it). */
    userHasTyped: boolean;
    /** Keyboard-navigated suggestion index (-1 = none). */
    hoveredIndex: number;
    /** Loaded search history entries for the suggestions dropdown. */
    searchEntries: string[];
    /** Whether a context menu popup is open (shows transparent overlay). */
    popupOpen: boolean;
    /** Whether the bookmarks drawer is visible. */
    bookmarksOpen: boolean;
    /** Bookmarks drawer width in pixels. Persisted (NH3 — sixth instance of `leftPanelWidth`-equivalent silent fix). */
    bookmarksWidth: number;
    /** SecondaryViews sidebar width (Categories/Tags/Hostnames panels) inside the
     *  bookmarks surfaces. Persisted per epic Concern 4 (US-601). */
    bookmarksSidebarWidth?: number;
    /** Whether the current URL is bookmarked (star button state). */
    isBookmarked: boolean;
    /** Whether bookmarks have been initialized. */
    bookmarksReady: boolean;

    /** Number of popups/tabs blocked by rate limiting since last dismiss. */
    blockedPopupCount: number;

    /** Whether the find-in-page bar is visible. */
    findBarVisible: boolean;
    /** Current find-in-page search text. */
    findText: string;
    /** Active match ordinal (0-based). */
    findActiveMatch: number;
    /** Total number of matches found. */
    findTotalMatches: number;
}

export const DEFAULT_URL = "about:blank";

let nextInternalTabId = 1;
let nextGroupId = 1;

export function createInternalTabId(): string {
    return `bt-${nextInternalTabId++}`;
}

export function createTabGroupId(): string {
    return `bg-${nextGroupId++}`;
}

function createTab(url = DEFAULT_URL, groupId?: string): BrowserTabData {
    return {
        id: createInternalTabId(),
        url,
        pageTitle: "",
        loading: false,
        canGoBack: false,
        canGoForward: false,
        favicon: "",
        audible: false,
        muted: false,
        homeUrl: url !== DEFAULT_URL ? url : "",
        navHistory: [],
        groupId: groupId || createTabGroupId(),
    };
}

export const getDefaultBrowserPageState = (): BrowserEditorState => {
    const tab = createTab();
    return {
        ...getDefaultEditorModelState(),
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
        tabsPanelWidth: 34,
        profileName: "",
        isIncognito: false,
        isTor: false,
        torStatus: "disconnected",
        torLog: "",
        torOverlayVisible: false,
        pageMuted: false,
        _anyTabAudible: false,
        searchEngineId: "google",
        lastSearchQuery: "",
        // Ephemeral state (managed by sub-models)
        openedByAgent: false,
        urlInput: DEFAULT_URL,
        suggestionsOpen: false,
        userHasTyped: false,
        hoveredIndex: -1,
        searchEntries: [],
        popupOpen: false,
        bookmarksOpen: false,
        bookmarksWidth: 0,
        isBookmarked: false,
        bookmarksReady: false,
        blockedPopupCount: 0,
        findBarVisible: false,
        findText: "",
        findActiveMatch: 0,
        findTotalMatches: 0,
    };
};

/**
 * The Persephone page title for a browser page.
 *
 * Incognito and Tor sessions report a constant `"Browser"` and never track the active tab. The
 * page title is not a private surface: it shows in the tab strip and, more importantly, is
 * returned in `pages` summaries, which already withhold `url` for these modes and refuse to drive
 * them through the call surface. The title was
 * the remaining leak -- it named the site being viewed.
 *
 * Suppressed here, at every point of assignment, rather than masked at the MCP boundary: one rule
 * then covers the page title, the tab strip and the tool output together, and cannot be bypassed
 * by a new caller. The browser's *own* tab labels are unaffected -- they read `pageTitle`, which
 * still tracks the page, so the user still sees which tab is which inside the session.
 */
export function browserPageTitle(
    flags: { isIncognito?: boolean; isTor?: boolean; openedByAgent?: boolean },
    pageTitle: string | undefined,
): string {
    // A private page the agent opened is readable by the agent — say so in the tab, so the user
    // never mistakes it for their own private session.
    if (flags.isIncognito || flags.isTor) return flags.openedByAgent ? "Browser (agent)" : "Browser";
    return pageTitle || "Browser";
}

/** Compute the Electron session partition string for a browser page. */
export function getPartitionString(
    profileName: string,
    isIncognito: boolean,
    incognitoId?: string,
    isTor?: boolean,
    torId?: string,
): string {
    if (isTor) {
        return `browser-tor-${torId || crypto.randomUUID()}`;
    }
    if (isIncognito) {
        return `browser-incognito-${incognitoId || crypto.randomUUID()}`;
    }
    return `persist:browser-${profileName || "default"}`;
}

export { BrowserEditor as BrowserEditorModel } from "./BrowserEditor";
