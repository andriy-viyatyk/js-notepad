/** Shared typed operations for browser, board, and app-window automation targets. */
const { ipcRenderer } = require("electron"); // eslint-disable-line @typescript-eslint/no-var-requires
import { BrowserChannel } from "../../ipc/browser-ipc";
import type { NetworkLogEntry } from "../../ipc/browser-ipc";
import { callOnRef } from "./ref";
import { buildSnapshot, detectOverlay } from "./snapshot";
import { pressKey, typeText } from "./input";
import type { IBrowserTarget, ITargetTab } from "./types";

export interface RefLocator {
    ref: string;
}

export interface SelectorLocator {
    selector: string;
}

export type ElementLocator = RefLocator | SelectorLocator;

/** Resolve the explicit facade locator forms. Plain strings are always selectors. */
export function resolveElementLocator(value: string): SelectorLocator;
export function resolveElementLocator(value: unknown): ElementLocator;
export function resolveElementLocator(value: unknown): ElementLocator {
    if (typeof value === "string") return { selector: value };
    if (value && typeof value === "object"
        && typeof (value as { ref?: unknown }).ref === "string") {
        return { ref: (value as { ref: string }).ref };
    }
    throw new Error("Expected a CSS selector string or an object of the form { ref: string }.");
}

export interface SnapshotOptions {
    overlayHint: boolean;
}

/** Build an accessibility snapshot and optionally prepend the existing overlay warning. */
export async function snapshot(
    target: IBrowserTarget,
    tabId: string | undefined,
    options: SnapshotOptions,
): Promise<string> {
    const cdp = target.cdp(tabId);
    const overlayHint = options.overlayHint ? await detectOverlay(cdp) : null;
    const tree = await buildSnapshot(cdp);
    if (overlayHint) return `# ${overlayHint}\n${tree}`;
    return tree;
}

/** Wait for navigation to start and then for the new document to finish loading. */
export async function navigateAndWait(target: IBrowserTarget, url: string): Promise<void> {
    // Capture current URL so we can detect when navigation starts.
    // navigate() updates the webview asynchronously, so we must wait for that gap before polling
    // readyState.
    const oldUrl = await target.cdp().evaluate('document.location.href').catch(() => '');
    target.navigate(url);

    // Phase 1: wait for URL to change OR readyState to go non-complete (navigation started).
    // Max 2s — if nothing changes we fall through and let phase 2 time out gracefully.
    await target.cdp().evaluate(`new Promise((resolve) => {
        const oldHref = ${JSON.stringify(oldUrl)};
        const start = Date.now();
        const check = () => {
            if (document.location.href !== oldHref || document.readyState !== 'complete') {
                resolve(true); return;
            }
            if (Date.now() - start > 2000) { resolve(true); return; }
            setTimeout(check, 50);
        };
        setTimeout(check, 50);
    })`).catch(() => {}); // old page context is destroyed on navigation — that's fine

    // Phase 2: wait for the new page to finish loading.
    await target.cdp().evaluate(`new Promise((resolve) => {
        if (document.readyState === 'complete') { resolve(true); return; }
        const start = Date.now();
        const check = () => {
            if (document.readyState === 'complete') { resolve(true); return; }
            if (Date.now() - start > 10000) { resolve(true); return; }
            setTimeout(check, 100);
        };
        setTimeout(check, 100);
    })`).catch(() => {});
}

/** Navigate back and preserve the browser command's two-phase loading wait. */
export async function navigateBackAndWait(target: IBrowserTarget): Promise<void> {
    const oldUrl = await target.cdp().evaluate('document.location.href').catch(() => '');
    target.back();

    // Phase 1: wait for navigation to start (same race-condition fix as navigateAndWait).
    await target.cdp().evaluate(`new Promise((resolve) => {
        const oldHref = ${JSON.stringify(oldUrl)};
        const start = Date.now();
        const check = () => {
            if (document.location.href !== oldHref || document.readyState !== 'complete') {
                resolve(true); return;
            }
            if (Date.now() - start > 2000) { resolve(true); return; }
            setTimeout(check, 50);
        };
        setTimeout(check, 50);
    })`).catch(() => {});

    // Phase 2: wait for the new page to finish loading.
    await target.cdp().evaluate(`new Promise((resolve) => {
        if (document.readyState === 'complete') { resolve(true); return; }
        const start = Date.now();
        const check = () => {
            if (document.readyState === 'complete') { resolve(true); return; }
            if (Date.now() - start > 10000) { resolve(true); return; }
            setTimeout(check, 100);
        };
        setTimeout(check, 100);
    })`).catch(() => {});
}

/** Click an element using a selector or a host-local accessibility ref. */
export async function clickElement(
    target: IBrowserTarget,
    locator: ElementLocator,
    tabId?: string,
): Promise<void> {
    target.focusWebview(tabId);
    if ("selector" in locator) {
        const s = JSON.stringify(locator.selector);
        await target.cdp(tabId).evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            el.scrollIntoView({ block: 'center' });
            el.click();
        })()`);
    } else {
        await callOnRef(target.cdp(tabId), locator.ref,
            "function() { this.scrollIntoView({block:'center'}); this.click(); }");
    }
}

/** Dispatch the existing synthetic hover events on a selector or accessibility ref. */
export async function hoverElement(
    target: IBrowserTarget,
    locator: ElementLocator,
    tabId?: string,
): Promise<void> {
    target.focusWebview(tabId);
    const hoverJs = `
        this.scrollIntoView({block:'center'});
        this.dispatchEvent(new MouseEvent('mouseenter', {bubbles:false, composed:true}));
        this.dispatchEvent(new MouseEvent('mouseover',  {bubbles:true,  composed:true}));
    `;
    if ("selector" in locator) {
        const s = JSON.stringify(locator.selector);
        await target.cdp(tabId).evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            ${hoverJs.replace(/this/g, "el")}
        })()`);
    } else {
        await callOnRef(target.cdp(tabId), locator.ref,
            `function() { ${hoverJs} }`);
    }
}

/** Use the existing input implementation with an explicitly resolved locator. */
export async function typeTextInto(
    target: IBrowserTarget,
    locator: ElementLocator,
    text: string,
    options: { slowly?: boolean; submit?: boolean } = {},
): Promise<void> {
    await typeText(target, {
        selector: "selector" in locator ? locator.selector : undefined,
        ref: "ref" in locator ? locator.ref : undefined,
        text,
        slowly: options.slowly,
        submit: options.submit,
    });
}

/** Select one option and dispatch the existing change event. */
export async function selectOption(
    target: IBrowserTarget,
    locator: ElementLocator,
    value: string | string[],
    tabId?: string,
): Promise<void> {
    const selectedValue = Array.isArray(value) ? value[0] : value;
    if (selectedValue == null) throw new Error("Missing 'value' or 'values' parameter");
    if ("selector" in locator) {
        const s = JSON.stringify(locator.selector);
        await target.cdp(tabId).evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            el.value = ${JSON.stringify(selectedValue)};
            el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
    } else {
        await callOnRef(target.cdp(tabId), locator.ref,
            `function() { this.value = ${JSON.stringify(selectedValue)}; this.dispatchEvent(new Event('change',{bubbles:true})); }`);
    }
}

/** Focus the target and dispatch a key or compound key through the existing input implementation. */
export async function pressKeyOnTarget(
    target: IBrowserTarget,
    key: string,
    tabId?: string,
): Promise<void> {
    target.focusWebview(tabId);
    await pressKey(target.cdp(tabId), key);
}

/** Evaluate an expression in the selected target tab. */
export async function evaluateInTarget(
    target: IBrowserTarget,
    expression: string,
    tabId?: string,
): Promise<unknown> {
    return target.cdp(tabId).evaluate(expression);
}

/** Read an element's text using a selector or a host-local accessibility ref. */
export async function getElementText(
    target: IBrowserTarget,
    locator: ElementLocator,
    tabId?: string,
): Promise<string | null> {
    if ("selector" in locator) {
        return target.cdp(tabId).evaluate(
            `document.querySelector(${JSON.stringify(locator.selector)})?.textContent ?? null`,
        );
    }
    return callOnRef(target.cdp(tabId), locator.ref,
        "function() { return this.textContent ?? null; }", true);
}

/** Read an element's value using a selector or a host-local accessibility ref. */
export async function getElementValue(
    target: IBrowserTarget,
    locator: ElementLocator,
    tabId?: string,
): Promise<string | null> {
    if ("selector" in locator) {
        return target.cdp(tabId).evaluate(
            `document.querySelector(${JSON.stringify(locator.selector)})?.value ?? null`,
        );
    }
    return callOnRef(target.cdp(tabId), locator.ref,
        "function() { return this.value ?? null; }", true);
}

/** Read an element attribute using a selector or a host-local accessibility ref. */
export async function getElementAttribute(
    target: IBrowserTarget,
    locator: ElementLocator,
    attribute: string,
    tabId?: string,
): Promise<string | null> {
    if ("selector" in locator) {
        return target.cdp(tabId).evaluate(
            `document.querySelector(${JSON.stringify(locator.selector)})?.getAttribute(${JSON.stringify(attribute)}) ?? null`,
        );
    }
    return callOnRef(target.cdp(tabId), locator.ref,
        `function() { return this.getAttribute(${JSON.stringify(attribute)}); }`, true);
}

/** Read an element's inner HTML using a selector or a host-local accessibility ref. */
export async function getElementHtml(
    target: IBrowserTarget,
    locator: ElementLocator,
    tabId?: string,
): Promise<string | null> {
    if ("selector" in locator) {
        return target.cdp(tabId).evaluate(
            `document.querySelector(${JSON.stringify(locator.selector)})?.innerHTML ?? null`,
        );
    }
    return callOnRef(target.cdp(tabId), locator.ref,
        "function() { return this.innerHTML ?? null; }", true);
}

/** Check whether a selector or host-local accessibility ref identifies an element. */
export async function elementExists(
    target: IBrowserTarget,
    locator: ElementLocator,
    tabId?: string,
): Promise<boolean> {
    if ("selector" in locator) {
        return target.cdp(tabId).evaluate(
            `!!document.querySelector(${JSON.stringify(locator.selector)})`,
        );
    }
    await callOnRef(target.cdp(tabId), locator.ref, "function() { return true; }", true);
    return true;
}

export type WaitMode =
    | { kind: "selector"; selector: string }
    | { kind: "text"; text: string }
    | { kind: "textGone"; text: string }
    | { kind: "time"; seconds: number };

export interface WaitForOptions {
    mode: WaitMode;
    timeout?: number;
    tabId?: string;
}

/** Wait using one of the browser_wait_for modes, without wrapping the result in an MCP response. */
export async function waitFor(target: IBrowserTarget, options: WaitForOptions): Promise<void> {
    const timeout = options.timeout ?? 30000;
    const { mode } = options;
    if (mode.kind === "time") {
        await new Promise(resolve => setTimeout(resolve, Math.round(mode.seconds * 1000)));
    } else if (mode.kind === "selector") {
        const s = JSON.stringify(mode.selector);
        await target.cdp(options.tabId).evaluate(`new Promise((resolve, reject) => {
            if (document.querySelector(${s})) { resolve(true); return; }
            const start = Date.now();
            const check = () => {
                if (document.querySelector(${s})) { resolve(true); return; }
                if (Date.now() - start > ${timeout}) {
                    reject(new Error('Timeout waiting for selector: ' + ${s}));
                    return;
                }
                requestAnimationFrame(check);
            };
            requestAnimationFrame(check);
        })`);
    } else if (mode.kind === "text") {
        const escaped = mode.text.replace(/"/g, '\\"');
        await target.cdp(options.tabId).evaluate(`new Promise((resolve, reject) => {
            const check = () => {
                if (document.body?.innerText?.includes(${JSON.stringify(mode.text)})) { resolve(true); return; }
                if (Date.now() - start > ${timeout}) {
                    reject(new Error('Timeout waiting for text: "${escaped}"'));
                    return;
                }
                requestAnimationFrame(check);
            };
            const start = Date.now();
            check();
        })`);
    } else {
        const escaped = mode.text.replace(/"/g, '\\"');
        await target.cdp(options.tabId).evaluate(`new Promise((resolve, reject) => {
            const check = () => {
                if (!document.body?.innerText?.includes(${JSON.stringify(mode.text)})) { resolve(true); return; }
                if (Date.now() - start > ${timeout}) {
                    reject(new Error('Timeout waiting for text to disappear: "${escaped}"'));
                    return;
                }
                requestAnimationFrame(check);
            };
            const start = Date.now();
            check();
        })`);
    }
}

export async function ensureTargetReady(target: IBrowserTarget): Promise<void> {
    await target.ensureReady?.();
}

export function listTabs(target: IBrowserTarget): ReadonlyArray<ITargetTab> {
    return target.tabs;
}

export async function openTab(target: IBrowserTarget, url?: string): Promise<ReadonlyArray<ITargetTab>> {
    target.addTab(url);
    await new Promise(resolve => setTimeout(resolve, 200));
    return target.tabs;
}

export async function closeTab(target: IBrowserTarget, index?: number): Promise<ReadonlyArray<ITargetTab>> {
    if (index != null) {
        const tab = target.tabs[index];
        if (!tab) throw new Error(`No tab at index ${index}`);
        target.closeTab(tab.id);
    } else {
        target.closeTab();
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    return target.tabs;
}

export async function selectTab(target: IBrowserTarget, index: number): Promise<ReadonlyArray<ITargetTab>> {
    const tab = target.tabs[index];
    if (!tab) throw new Error(`No tab at index ${index}`);
    await target.switchTab(tab.id);
    return target.tabs;
}

export interface ScreenshotResult {
    type: "image";
    data: string;
    mimeType: "image/png";
}

export async function takeScreenshot(
    target: IBrowserTarget,
    tabId?: string,
    options: { returnUndefinedIfUnavailable?: boolean } = {},
): Promise<ScreenshotResult | undefined> {
    try {
        const { data } = await target.cdp(tabId).send("Page.captureScreenshot", { format: "png" });
        if (!data) return undefined;
        return { type: "image", data, mimeType: "image/png" };
    } catch (error) {
        if (options.returnUndefinedIfUnavailable) return undefined;
        throw error;
    }
}

export async function networkRequests(target: IBrowserTarget, tabId?: string): Promise<NetworkLogEntry[]> {
    const tab = tabId ? target.tabs.find(item => item.id === tabId) : target.activeTab;
    if (!tab) throw new Error(tabId ? `No tab with id "${tabId}"` : "No active tab");
    return ipcRenderer.invoke(BrowserChannel.getNetworkLog, target.cdp(tab.id).registrationKey);
}

export function closeActiveTab(target: IBrowserTarget): string {
    target.closeTab();
    return "Tab closed";
}
