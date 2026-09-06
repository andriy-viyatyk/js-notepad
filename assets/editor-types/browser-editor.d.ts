/**
 * IBrowserEditor — script interface for browser pages.
 *
 * Obtained via `page.editor`. Only available for browser pages.
 *
 * All automation methods accept an optional `{ tabId }` option to target
 * a specific tab. Defaults to the active tab.
 *
 * @example
 * const browser = page.editor;
 * browser.navigate("https://example.com");
 *
 * // Query and interact
 * await browser.waitForSelector("h1");
 * const heading = await browser.getText("h1");
 * await browser.type("#search", "hello");
 * await browser.click("#submit");
 *
 * // Work with tabs
 * const newTab = browser.addTab("https://other.com");
 * await browser.waitForNavigation({ tabId: newTab });
 * const title = await browser.getText("h1", { tabId: newTab });
 */
export type IBrowserElementLocator = string | { ref: string };

export interface IBrowserScreenshot {
    readonly type: "image";
    readonly data: string;
    readonly mimeType: "image/png";
}

export interface IBrowserNetworkRequest {
    readonly id: number;
    readonly url: string;
    readonly method: string;
    readonly resourceType: string;
    readonly referrer: string;
    readonly timestamp: number;
    readonly requestHeaders: Record<string, string>;
    readonly requestBody?: string;
    readonly statusCode?: number;
    readonly statusLine?: string;
    readonly responseHeaders?: Record<string, string[]>;
    readonly fromCache?: boolean;
    readonly error?: string;
}

export interface IBrowserEditor {
    readonly id: "browser-view";
    readonly name: string;
    /** Current URL of the active tab. */
    readonly url: string | undefined;

    /** Current page title of the active tab. */
    readonly title: string | undefined;

    // --- Navigation ---

    /** Navigate the active tab to a URL. Supports URLs and search queries. */
    navigate(url: string): void;

    /** Go back in history. */
    back(): void;

    /** Go forward in history. */
    forward(): void;

    /** Reload the current page (or stop loading if in progress). */
    reload(): void;

    // --- Tab management ---

    /** List of all open tabs in this browser page. */
    readonly tabs: IBrowserTab[];

    /** The active (visible) tab. */
    readonly activeTab: IBrowserTab | undefined;

    /** Open a new tab. Returns the new tab's ID. */
    addTab(url?: string): string;

    /** Close a tab. Defaults to active tab. */
    closeTab(tabId?: string): "Tab closed";

    /** Switch to a tab (make it active/visible). */
    switchTab(tabId: string): void;

    // --- Evaluate ---

    /**
     * Run JavaScript in the page and return the result.
     * Supports async expressions (awaited automatically).
     */
    evaluate(expression: string, options?: { tabId?: string }): Promise<unknown>;

    /**
     * Get an accessibility snapshot of the page as a YAML-like tree.
     * Format matches Playwright MCP's browser_snapshot output. It may begin with
     * `# <overlay>` when a modal covers the page. Pass a returned ref explicitly as
     * `{ ref: "e52" }`; plain strings are always CSS selectors.
     *
     * @example
     * const snapshot = await browser.snapshot();
     * // - heading "Page Title" [level=1] [ref=e40]
     * // - textbox "Search" [ref=e52]
     * // - button "Submit" [ref=e65]
     */
    snapshot(options?: { tabId?: string }): Promise<string>;

    // --- Query methods ---

    /** Get textContent by CSS selector or explicit snapshot ref. Returns null if not found. */
    getText(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<string | null>;

    /** Get a value by CSS selector or explicit snapshot ref. Returns null if not found. */
    getValue(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<string | null>;

    /** Get an attribute by CSS selector or explicit snapshot ref. Returns null if unavailable. */
    getAttribute(locator: IBrowserElementLocator, attribute: string, options?: { tabId?: string }): Promise<string | null>;

    /** Get innerHTML by CSS selector or explicit snapshot ref. Returns null if not found. */
    getHtml(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<string | null>;

    /** Check whether a CSS selector or explicit snapshot ref identifies an element. */
    exists(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<boolean>;

    // --- Interaction methods ---

    /** Click by CSS selector or explicit snapshot ref. Throws if not found. */
    click(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;

    /** Hover by CSS selector or explicit snapshot ref. Throws if not found. */
    hover(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;

    /**
     * Type text into an input/textarea. Clears existing value first.
     * Dispatches input and change events for framework compatibility.
     * Throws if not found.
     */
    type(locator: IBrowserElementLocator, text: string, options?: { tabId?: string; slowly?: boolean; submit?: boolean }): Promise<void>;

    /** Select an option in a <select> element by value. Throws if not found. */
    select(locator: IBrowserElementLocator, values: string | string[], options?: { tabId?: string }): Promise<void>;

    /** Check a checkbox or radio button. Throws if not found. */
    check(selector: string, options?: { tabId?: string }): Promise<void>;

    /** Uncheck a checkbox. Throws if not found. */
    uncheck(selector: string, options?: { tabId?: string }): Promise<void>;

    /** Clear the value of an input/textarea. Throws if not found. */
    clear(selector: string, options?: { tabId?: string }): Promise<void>;

    /** Wait for exactly one selector, text, textGone, or time condition. */
    waitFor(options: {
        selector?: string;
        text?: string;
        textGone?: string;
        time?: number;
        timeout?: number;
        tabId?: string;
    }): Promise<void>;

    /** Capture the selected tab as a PNG; unavailable sessions return undefined. */
    screenshot(options?: { tabId?: string }): Promise<IBrowserScreenshot | undefined>;

    /** Get recorded network requests for the selected tab. */
    networkRequests(options?: { tabId?: string }): Promise<IBrowserNetworkRequest[]>;

    // --- Wait methods ---

    /**
     * Wait for an element matching the selector to appear in the DOM.
     * @param options.timeout — max wait time in ms (default 30000)
     * @param options.tabId — target tab (default: active tab)
     */
    waitForSelector(selector: string, options?: { timeout?: number; tabId?: string }): Promise<void>;

    /**
     * Wait for the page to finish loading (document.readyState === "complete").
     * For SPA navigations, use waitForSelector() instead.
     * @param options.timeout — max wait time in ms (default 30000)
     * @param options.tabId — target tab (default: active tab)
     */
    waitForNavigation(options?: { timeout?: number; tabId?: string }): Promise<void>;

    /** Wait for a specified number of milliseconds. */
    wait(ms: number): Promise<void>;

    /**
     * Press a key or key combination via CDP.
     * Supports compound keys: "Control+a", "Shift+Enter", "Control+Shift+Delete".
     */
    pressKey(key: string, options?: { tabId?: string }): Promise<void>;
}

/** Represents a browser internal tab. */
export interface IBrowserTab {
    /** Internal tab ID (use with tabId option in automation methods). */
    readonly id: string;
    /** Current URL. */
    readonly url?: string;
    /** Page title. */
    readonly title?: string;
    /** Whether the page is currently loading. */
    readonly loading: boolean;
    /** Whether this is the active (visible) tab. */
    readonly active: boolean;
}
