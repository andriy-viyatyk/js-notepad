import type { BrowserEditorModel } from "../../editors/browser/BrowserEditorModel";
import {
    clickElement,
    elementExists,
    ensureTargetReady,
    evaluateInTarget,
    getElementAttribute,
    getElementHtml,
    getElementText,
    getElementValue,
    hoverElement,
    networkRequests,
    pressKeyOnTarget,
    resolveElementLocator,
    selectOption,
    takeScreenshot,
    snapshot,
    typeTextInto,
    waitFor,
} from "../../automation/operations";
import type { WaitMode } from "../../automation/operations";
import type { IAiElementDeclaration, IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";
import type { IBrowserElementLocator, IBrowserNetworkRequest, IBrowserScreenshot, IBrowserTab } from "../../api/types/browser-editor";
import { ui } from "../../api/ui";
import { createElements } from "../ai-vision/elements";
import { activatePageAndWaitForLayout, pageScopeSelector } from "../ai-vision/page-elements";
import { BROWSER_AUTOMATION_MEMBERS } from "../ai-vision/browser-automation-members";

/** Options for targeting a specific browser tab. */
interface TabOption {
    tabId?: string;
}

/** Options for wait methods. */
interface WaitOption extends TabOption {
    timeout?: number;
}

const BROWSER_EDITOR_MEMBERS: readonly IAiMember[] = [
    { name: "id", kind: "property", summary: "The concrete current editor id." },
    { name: "name", kind: "property", summary: "The editor's registry display name." },
    { name: "url", kind: "property", summary: "Current URL of the active tab." },
    { name: "title", kind: "property", summary: "Current page title of the active tab." },
    { name: "navigate", kind: "method", signature: "navigate(url: string): void", summary: "Navigate the active tab to a URL. Supports URLs and search queries." },
    { name: "back", kind: "method", signature: "back(): void", summary: "Go back in history." },
    { name: "forward", kind: "method", signature: "forward(): void", summary: "Go forward in history." },
    { name: "reload", kind: "method", signature: "reload(): void", summary: "Reload the current page (or stop loading if in progress)." },
    { name: "tabs", kind: "property", summary: "List of all open tabs in this browser page." },
    { name: "activeTab", kind: "property", summary: "The active (visible) tab." },
    { name: "addTab", kind: "method", signature: "addTab(url?: string): string", summary: "Open a new tab. Returns the new tab's ID." },
    { name: "closeTab", kind: "method", signature: "closeTab(tabId?: string): \"Tab closed\"", summary: "Close a tab. Defaults to active tab; this closes a browser tab, not the Persephone page.", caution: "closes a browser tab" },
    { name: "switchTab", kind: "method", signature: "switchTab(tabId: string): void", summary: "Switch to a tab (make it active/visible)." },
    { name: "check", kind: "method", signature: "check(selector: string, options?: { tabId?: string }): Promise<void>", summary: "Check a checkbox or radio button. Throws if not found." },
    { name: "uncheck", kind: "method", signature: "uncheck(selector: string, options?: { tabId?: string }): Promise<void>", summary: "Uncheck a checkbox. Throws if not found." },
    { name: "clear", kind: "method", signature: "clear(selector: string, options?: { tabId?: string }): Promise<void>", summary: "Clear the value of an input/textarea. Throws if not found.", caution: "clears page input" },
    { name: "waitForSelector", kind: "method", signature: "waitForSelector(selector: string, options?: { timeout?: number; tabId?: string }): Promise<void>", summary: "Wait for an element matching the selector to appear in the DOM. options.timeout is the max wait time in ms (default 30000); options.tabId targets a tab (default active tab)." },
    { name: "waitForNavigation", kind: "method", signature: "waitForNavigation(options?: { timeout?: number; tabId?: string }): Promise<void>", summary: "Wait for the page to finish loading (document.readyState === complete). For SPA navigations, use waitForSelector() instead. options.timeout is the max wait time in ms (default 30000); options.tabId targets a tab (default active tab)." },
    { name: "wait", kind: "method", signature: "wait(ms: number): Promise<void>", summary: "Wait for a specified number of milliseconds." },
];

const BROWSER_ELEMENTS: readonly IAiElementDeclaration[] = [
    { name: "url-input", purpose: "Browser address bar input" },
    { name: "url-navigate", purpose: "Navigate to the address-bar URL" },
    { name: "url-bookmark-toggle", purpose: "Toggle a bookmark for the current URL" },
    { name: "toolbar-back", purpose: "Go back in browser history" },
    { name: "toolbar-forward", purpose: "Go forward in browser history" },
    { name: "toolbar-reload", purpose: "Reload or stop the current page" },
    { name: "toolbar-home", purpose: "Open the browser home page" },
    { name: "toolbar-bookmarks", purpose: "Open the bookmarks drawer" },
    { name: "toolbar-more", purpose: "Open the browser page menu" },
    { name: "toolbar-devtools", purpose: "Open browser developer tools" },
    { name: "toolbar-close", purpose: "Close the browser editor" },
    { name: "toolbar-tor-info", purpose: "Open Tor information (Tor mode only)" },
    { name: "tabs-panel-host", purpose: "Browser tab strip host" },
    { name: "popup-blocked-bar", purpose: "Blocked-popup notification bar" },
];

const BROWSER_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to "browser-view".
Use elements for Persephone browser chrome (address bar, toolbar, tabs host, and blocked-popup bar);
those controls are not in snapshot(). Use snapshot() for the web page inside the webview and pass its
returned refs as { ref: "e52" } to supported target methods. Plain strings are always CSS selectors.
snapshot() may begin with # <overlay> when a modal covers the page. browser_tabs maps to
tabs/addTab/closeTab/switchTab, browser_close closes the active browser tab, and screenshot() returns
metadata plus an inline image block through call. Transient menus, drawers, dialogs, suggestions,
downloads, and popup actions are not part of the default curated elements list; use the chrome control
that opens them first. Password-field behavior must be established by the live Chromium check in the
task verification notes; source inspection alone does not establish whether its value is exposed.`;

/**
 * Safe facade around BrowserEditorModel for script access.
 * Implements the IBrowserEditor interface from api/types/browser-editor.d.ts.
 *
 * - Direct model wrap (no ViewModel acquisition, no ref-counting)
 * - Exposes navigation, automation, and tab management methods
 * - All automation methods accept optional { tabId } to target specific tabs
 */
export class BrowserEditorFacade implements IAiVisible {
    constructor(private readonly model: BrowserEditorModel, readonly id: string, readonly name: string) {}

    get aiVision(): IAiVisionDescriptor {
        const pageId = this.model.page?.id;
        const elements = createElements(BROWSER_ELEMENTS, ui.highlightElement.bind(ui), {
            scopeSelector: pageId ? pageScopeSelector(pageId) : undefined,
            beforeHighlight: pageId ? () => activatePageAndWaitForLayout(pageId) : undefined,
            highlightOptions: { all: true },
        });
        return {
            kind: "BrowserEditor",
            summary: "Browser navigation, inspection, and interaction facade.",
            members: [...BROWSER_AUTOMATION_MEMBERS, ...BROWSER_EDITOR_MEMBERS, ...elements.members],
            help: BROWSER_EDITOR_HELP,
            elements: BROWSER_ELEMENTS,
            provide: elements.provide,
            summarize: () => {
                const tabs = this.tabs;
                const summary: Record<string, unknown> = {
                    kind: "BrowserEditor",
                    id: this.id,
                    name: this.name,
                    tabCount: tabs.length,
                };
                if (this.url !== undefined) summary.url = this.url;
                if (this.title !== undefined) summary.title = this.title;
                if (this.activeTab) summary.activeTabId = this.activeTab.id;
                return summary;
            },
        };
    }

    get url(): string | undefined {
        return this.model.state.get().url || undefined;
    }

    get title(): string | undefined {
        return this.model.state.get().pageTitle || undefined;
    }

    navigate(url: string): void {
        this.model.navigate(url);
    }

    back(): void {
        this.model.webview.goBack();
    }

    forward(): void {
        this.model.webview.goForward();
    }

    reload(): void {
        this.model.webview.reloadOrStop();
    }

    /** Run JavaScript in the page and return the result. */
    async evaluate(expression: string, options?: TabOption): Promise<unknown> {
        await ensureTargetReady(this.model.target);
        return evaluateInTarget(this.model.target, expression, options?.tabId);
    }

    /**
     * Get an accessibility snapshot of the page as a YAML-like tree.
     * Format matches Playwright MCP's browser_snapshot output.
     * Each interactive element has a ref (e.g., ref=e52) usable for targeting.
     */
    async snapshot(options?: TabOption): Promise<string> {
        await ensureTargetReady(this.model.target);
        return snapshot(this.model.target, options?.tabId, { overlayHint: true });
    }

    // =====================================================================
    // Tab management
    // =====================================================================

    /** List of all open tabs in this browser page. */
    get tabs(): IBrowserTab[] {
        const state = this.model.state.get();
        return state.tabs.map(t => ({
            id: t.id,
            ...(t.url ? { url: t.url } : {}),
            ...(t.pageTitle ? { title: t.pageTitle } : {}),
            loading: t.loading,
            active: t.id === state.activeTabId,
        }));
    }

    /** The active tab. */
    get activeTab(): IBrowserTab | undefined {
        const state = this.model.state.get();
        const tab = state.tabs.find(t => t.id === state.activeTabId);
        if (!tab) return undefined;
        return {
            id: tab.id,
            ...(tab.url ? { url: tab.url } : {}),
            ...(tab.pageTitle ? { title: tab.pageTitle } : {}),
            loading: tab.loading,
            active: true,
        };
    }

    /** Open a new tab. Returns the new tab's ID. */
    addTab(url?: string): string {
        return this.model.addTab(url);
    }

    /** Close a tab. Defaults to active tab. */
    closeTab(tabId?: string): "Tab closed" {
        const id = tabId || this.model.state.get().activeTabId;
        this.model.closeTab(id);
        return "Tab closed";
    }

    /** Switch to a tab. */
    switchTab(tabId: string): void {
        this.model.switchTab(tabId);
    }

    // =====================================================================
    // Query methods
    // =====================================================================

    /** Get textContent of an element. Returns null if not found. */
    async getText(locator: IBrowserElementLocator, options?: TabOption): Promise<string | null> {
        return getElementText(this.model.target, resolveElementLocator(locator), options?.tabId);
    }

    /** Get the value of an input/textarea/select. Returns null if not found. */
    async getValue(locator: IBrowserElementLocator, options?: TabOption): Promise<string | null> {
        return getElementValue(this.model.target, resolveElementLocator(locator), options?.tabId);
    }

    /** Get an attribute value. Returns null if element or attribute not found. */
    async getAttribute(locator: IBrowserElementLocator, attribute: string, options?: TabOption): Promise<string | null> {
        return getElementAttribute(this.model.target, resolveElementLocator(locator), attribute, options?.tabId);
    }

    /** Get innerHTML of an element. Returns null if not found. */
    async getHtml(locator: IBrowserElementLocator, options?: TabOption): Promise<string | null> {
        return getElementHtml(this.model.target, resolveElementLocator(locator), options?.tabId);
    }

    /** Check if an element exists on the page. */
    async exists(locator: IBrowserElementLocator, options?: TabOption): Promise<boolean> {
        return elementExists(this.model.target, resolveElementLocator(locator), options?.tabId);
    }

    // =====================================================================
    // Interaction methods
    // =====================================================================

    /** Click an element. Throws if not found. */
    async click(locator: IBrowserElementLocator, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.model.target);
        await clickElement(this.model.target, resolveElementLocator(locator), options?.tabId);
    }

    /** Hover an element by CSS selector or explicit accessibility ref. */
    async hover(locator: IBrowserElementLocator, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.model.target);
        await hoverElement(this.model.target, resolveElementLocator(locator), options?.tabId);
    }

    /** Type text into an input/textarea/contentEditable. Clears existing value first. Throws if not found. */
    async type(locator: IBrowserElementLocator, text: string, options?: TabOption & { slowly?: boolean; submit?: boolean }): Promise<void> {
        await ensureTargetReady(this.model.target);
        await typeTextInto(this.model.target, resolveElementLocator(locator), text, {
            slowly: options?.slowly,
            submit: options?.submit,
        });
    }

    /** Select an option in a <select> element by value. Throws if not found. */
    async select(locator: IBrowserElementLocator, value: string | string[], options?: TabOption): Promise<void> {
        await ensureTargetReady(this.model.target);
        await selectOption(this.model.target, resolveElementLocator(locator), value, options?.tabId);
    }

    /** Capture the selected browser tab as a PNG, or undefined when its session is unavailable. */
    async screenshot(options?: TabOption): Promise<IBrowserScreenshot | undefined> {
        await ensureTargetReady(this.model.target);
        return takeScreenshot(this.model.target, options?.tabId, { returnUndefinedIfUnavailable: true });
    }

    /** Read the recorded network requests for the selected browser tab. */
    async networkRequests(options?: TabOption): Promise<IBrowserNetworkRequest[]> {
        await ensureTargetReady(this.model.target);
        return networkRequests(this.model.target, options?.tabId);
    }

    /** Check a checkbox or radio button. Throws if not found. */
    async check(selector: string, options?: TabOption): Promise<void> {
        const s = JSON.stringify(selector);
        await this.model.target.cdp(options?.tabId).evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            if (!el.checked) {
                el.checked = true;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        })()`);
    }

    /** Uncheck a checkbox. Throws if not found. */
    async uncheck(selector: string, options?: TabOption): Promise<void> {
        const s = JSON.stringify(selector);
        await this.model.target.cdp(options?.tabId).evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            if (el.checked) {
                el.checked = false;
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        })()`);
    }

    /** Clear the value of an input/textarea. Throws if not found. */
    async clear(selector: string, options?: TabOption): Promise<void> {
        const s = JSON.stringify(selector);
        await this.model.target.cdp(options?.tabId).evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            el.focus();
            el.value = '';
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
    }

    // =====================================================================
    // Wait methods
    // =====================================================================

    /**
     * Wait for an element matching the selector to appear in the DOM.
     * Polls inside the page using requestAnimationFrame for efficiency.
     */
    async waitForSelector(selector: string, options?: WaitOption): Promise<void> {
        const timeout = options?.timeout ?? 30000;
        await ensureTargetReady(this.model.target);
        await waitFor(this.model.target, {
            mode: { kind: "selector", selector: resolveElementLocator(selector).selector },
            timeout,
            tabId: options?.tabId,
        });
    }

    /** Wait for exactly one selector, text, textGone, or time condition. */
    async waitFor(options: {
        selector?: string;
        text?: string;
        textGone?: string;
        time?: number;
        timeout?: number;
        tabId?: string;
    }): Promise<void> {
        const modes = [options.selector, options.text, options.textGone, options.time]
            .filter(value => value !== undefined);
        if (modes.length !== 1) {
            throw new Error("Expected exactly one of 'selector', 'text', 'textGone', or 'time'.");
        }
        let mode: WaitMode;
        if (options.time !== undefined) {
            mode = { kind: "time", seconds: options.time };
        } else if (options.selector !== undefined) {
            mode = { kind: "selector", selector: options.selector };
        } else if (options.text !== undefined) {
            mode = { kind: "text", text: options.text };
        } else {
            mode = { kind: "textGone", text: options.textGone! };
        }
        await ensureTargetReady(this.model.target);
        await waitFor(this.model.target, {
            mode,
            timeout: options.timeout,
            tabId: options.tabId,
        });
    }

    /**
     * Wait for the page to finish loading (document.readyState === "complete").
     * For SPA navigations, use waitForSelector() instead.
     */
    async waitForNavigation(options?: WaitOption): Promise<void> {
        const timeout = options?.timeout ?? 30000;
        await this.model.target.cdp(options?.tabId).evaluate(`new Promise((resolve, reject) => {
            if (document.readyState === 'complete') { resolve(true); return; }
            const start = Date.now();
            const check = () => {
                if (document.readyState === 'complete') { resolve(true); return; }
                if (Date.now() - start > ${timeout}) {
                    reject(new Error('Timeout waiting for navigation'));
                    return;
                }
                setTimeout(check, 100);
            };
            setTimeout(check, 100);
        })`);
    }

    /** Wait for a specified number of milliseconds. */
    async wait(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Press a key or key combination via CDP.
     * Supports compound keys: "Control+a", "Shift+Enter", "Control+Shift+Delete".
     */
    async pressKey(key: string, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.model.target);
        await pressKeyOnTarget(this.model.target, key, options?.tabId);
    }
}
