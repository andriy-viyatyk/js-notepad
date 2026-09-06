import type { BrowserEditorModel } from "../../editors/browser/BrowserEditorModel";
import {
    clickElement,
    ensureTargetReady,
    evaluateInTarget,
    pressKeyOnTarget,
    resolveElementLocator,
    selectOption,
    snapshot,
    typeTextInto,
    waitFor,
} from "../../automation/operations";
import type { IAiMember, IAiVisible, IAiVisionDescriptor } from "../../../shared/ai-vision/types";

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
    { name: "closeTab", kind: "method", signature: "closeTab(tabId?: string): void", summary: "Close a tab. Defaults to active tab.", caution: "closes a browser tab" },
    { name: "switchTab", kind: "method", signature: "switchTab(tabId: string): void", summary: "Switch to a tab (make it active/visible)." },
    { name: "evaluate", kind: "method", signature: "evaluate(expression: string, options?: { tabId?: string }): Promise<unknown>", summary: "Run JavaScript in the page and return the result. Supports async expressions (awaited automatically).", caution: "arbitrary page JavaScript can mutate the page" },
    { name: "snapshot", kind: "method", signature: "snapshot(options?: { tabId?: string }): Promise<string>", summary: "Get an accessibility snapshot of the page as a YAML-like tree. Format matches Playwright MCP's browser_snapshot output. Each interactive element has a ref (e.g., ref=e52) usable for targeting." },
    { name: "getText", kind: "method", signature: "getText(selector: string, options?: { tabId?: string }): Promise<string | null>", summary: "Get textContent of an element. Returns null if not found." },
    { name: "getValue", kind: "method", signature: "getValue(selector: string, options?: { tabId?: string }): Promise<string | null>", summary: "Get the value of an input/textarea/select. Returns null if not found." },
    { name: "getAttribute", kind: "method", signature: "getAttribute(selector: string, attribute: string, options?: { tabId?: string }): Promise<string | null>", summary: "Get an attribute value. Returns null if element or attribute not found." },
    { name: "getHtml", kind: "method", signature: "getHtml(selector: string, options?: { tabId?: string }): Promise<string | null>", summary: "Get innerHTML of an element. Returns null if not found." },
    { name: "exists", kind: "method", signature: "exists(selector: string, options?: { tabId?: string }): Promise<boolean>", summary: "Check if an element exists on the page." },
    { name: "click", kind: "method", signature: "click(selector: string, options?: { tabId?: string }): Promise<void>", summary: "Click an element. Throws if not found." },
    { name: "type", kind: "method", signature: "type(selector: string, text: string, options?: { tabId?: string; slowly?: boolean; submit?: boolean }): Promise<void>", summary: "Type text into an input/textarea. Clears existing value first. Dispatches input and change events for framework compatibility. Throws if not found.", caution: "clears/replaces the target value" },
    { name: "select", kind: "method", signature: "select(selector: string, value: string, options?: { tabId?: string }): Promise<void>", summary: "Select an option in a <select> element by value. Throws if not found." },
    { name: "check", kind: "method", signature: "check(selector: string, options?: { tabId?: string }): Promise<void>", summary: "Check a checkbox or radio button. Throws if not found." },
    { name: "uncheck", kind: "method", signature: "uncheck(selector: string, options?: { tabId?: string }): Promise<void>", summary: "Uncheck a checkbox. Throws if not found." },
    { name: "clear", kind: "method", signature: "clear(selector: string, options?: { tabId?: string }): Promise<void>", summary: "Clear the value of an input/textarea. Throws if not found.", caution: "clears page input" },
    { name: "waitForSelector", kind: "method", signature: "waitForSelector(selector: string, options?: { timeout?: number; tabId?: string }): Promise<void>", summary: "Wait for an element matching the selector to appear in the DOM. options.timeout is the max wait time in ms (default 30000); options.tabId targets a tab (default active tab)." },
    { name: "waitForNavigation", kind: "method", signature: "waitForNavigation(options?: { timeout?: number; tabId?: string }): Promise<void>", summary: "Wait for the page to finish loading (document.readyState === complete). For SPA navigations, use waitForSelector() instead. options.timeout is the max wait time in ms (default 30000); options.tabId targets a tab (default active tab)." },
    { name: "wait", kind: "method", signature: "wait(ms: number): Promise<void>", summary: "Wait for a specified number of milliseconds." },
    { name: "pressKey", kind: "method", signature: "pressKey(key: string, options?: { tabId?: string }): Promise<void>", summary: "Press a key or key combination via CDP. Supports compound keys: Control+a, Shift+Enter, Control+Shift+Delete." },
];

const BROWSER_EDITOR_HELP = `Access via pages[i].editor after narrowing editor.id to \"browser-view\".
Browser navigation, tab management, page inspection, and interaction facade.`;

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
        return {
            kind: "BrowserEditor",
            summary: "Browser navigation, inspection, and interaction facade.",
            members: BROWSER_EDITOR_MEMBERS,
            help: BROWSER_EDITOR_HELP,
            summarize: () => {
                const tabs = this.tabs;
                return {
                    kind: "BrowserEditor",
                    id: this.id,
                    name: this.name,
                    url: this.url,
                    title: this.title,
                    tabCount: tabs.length,
                    activeTabId: this.activeTab.id,
                };
            },
        };
    }

    get url(): string {
        return this.model.state.get().url;
    }

    get title(): string {
        return this.model.state.get().pageTitle;
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
        return snapshot(this.model.target, options?.tabId, { overlayHint: false });
    }

    // =====================================================================
    // Tab management
    // =====================================================================

    /** List of all open tabs in this browser page. */
    get tabs(): Array<{ id: string; url: string; title: string; loading: boolean; active: boolean }> {
        const state = this.model.state.get();
        return state.tabs.map(t => ({
            id: t.id,
            url: t.url,
            title: t.pageTitle,
            loading: t.loading,
            active: t.id === state.activeTabId,
        }));
    }

    /** The active tab. */
    get activeTab(): { id: string; url: string; title: string; loading: boolean; active: boolean } {
        const state = this.model.state.get();
        const tab = state.tabs.find(t => t.id === state.activeTabId);
        return {
            id: tab?.id ?? "",
            url: tab?.url ?? "",
            title: tab?.pageTitle ?? "",
            loading: tab?.loading ?? false,
            active: true,
        };
    }

    /** Open a new tab. Returns the new tab's ID. */
    addTab(url?: string): string {
        return this.model.addTab(url);
    }

    /** Close a tab. Defaults to active tab. */
    closeTab(tabId?: string): void {
        const id = tabId || this.model.state.get().activeTabId;
        this.model.closeTab(id);
    }

    /** Switch to a tab. */
    switchTab(tabId: string): void {
        this.model.switchTab(tabId);
    }

    // =====================================================================
    // Query methods
    // =====================================================================

    /** Get textContent of an element. Returns null if not found. */
    async getText(selector: string, options?: TabOption): Promise<string | null> {
        return this.model.target.cdp(options?.tabId).evaluate(
            `document.querySelector(${JSON.stringify(selector)})?.textContent ?? null`,
        );
    }

    /** Get the value of an input/textarea/select. Returns null if not found. */
    async getValue(selector: string, options?: TabOption): Promise<string | null> {
        return this.model.target.cdp(options?.tabId).evaluate(
            `document.querySelector(${JSON.stringify(selector)})?.value ?? null`,
        );
    }

    /** Get an attribute value. Returns null if element or attribute not found. */
    async getAttribute(selector: string, attribute: string, options?: TabOption): Promise<string | null> {
        return this.model.target.cdp(options?.tabId).evaluate(
            `document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(attribute)}) ?? null`,
        );
    }

    /** Get innerHTML of an element. Returns null if not found. */
    async getHtml(selector: string, options?: TabOption): Promise<string | null> {
        return this.model.target.cdp(options?.tabId).evaluate(
            `document.querySelector(${JSON.stringify(selector)})?.innerHTML ?? null`,
        );
    }

    /** Check if an element exists on the page. */
    async exists(selector: string, options?: TabOption): Promise<boolean> {
        return this.model.target.cdp(options?.tabId).evaluate(
            `!!document.querySelector(${JSON.stringify(selector)})`,
        );
    }

    // =====================================================================
    // Interaction methods
    // =====================================================================

    /** Click an element. Throws if not found. */
    async click(selector: string, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.model.target);
        await clickElement(this.model.target, resolveElementLocator(selector), options?.tabId);
    }

    /** Type text into an input/textarea/contentEditable. Clears existing value first. Throws if not found. */
    async type(selector: string, text: string, options?: TabOption & { slowly?: boolean; submit?: boolean }): Promise<void> {
        await ensureTargetReady(this.model.target);
        // US-1335 owns forwarding options.tabId; preserve current active-tab behavior here.
        await typeTextInto(this.model.target, resolveElementLocator(selector), text, {
            slowly: options?.slowly,
            submit: options?.submit,
        });
    }

    /** Select an option in a <select> element by value. Throws if not found. */
    async select(selector: string, value: string, options?: TabOption): Promise<void> {
        await ensureTargetReady(this.model.target);
        await selectOption(this.model.target, resolveElementLocator(selector), value, options?.tabId);
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
