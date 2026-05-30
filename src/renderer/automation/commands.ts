/**
 * Browser automation MCP command handlers (Playwright-compatible).
 *
 * Extracted from mcp-handler.ts — all browser_* tool logic lives here.
 * Uses IBrowserTarget for browser access, keeping this module
 * independent of the browser editor's internal implementation.
 */
const { ipcRenderer } = require("electron"); // eslint-disable-line @typescript-eslint/no-var-requires
import { pagesModel } from "../api/pages";
import { settings } from "../api/settings";
import { BrowserChannel } from "../../ipc/browser-ipc";
import { BrowserEditor } from "../editors/browser";
import { pressKey, typeText } from "./input";
import { callOnRef } from "./ref";
import { buildSnapshot, detectOverlay } from "./snapshot";
import type { IBrowserTarget } from "./types";

// ── Types ───────────────────────────────────────────────────────────

interface McpResponse {
    result?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    error?: { code: number; message: string; data?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── Target Resolution ───────────────────────────────────────────────

/** Discriminate the error-response branch of `getTarget()`. Needed because
 *  `McpResponse.error` is optional, so `"error" in target` alone doesn't
 *  narrow the union for TS. */
function isErrorResponse(t: IBrowserTarget | McpResponse): t is McpResponse {
    return "error" in t;
}

/**
 * Get the automation target for the ACTIVE browser page.
 * Falls back to the first browser page if the active page is not a browser.
 */
async function getTarget(): Promise<IBrowserTarget | McpResponse> {
    const pages = pagesModel.state.get().pages;
    const activePage = pagesModel.activePage;

    // Prefer active page if it's a browser
    let browserPage = (activePage?.mainEditorInstance instanceof BrowserEditor) ? activePage : null;

    // Fallback to first browser page
    if (!browserPage) {
        browserPage = pages.find((p) => p.mainEditorInstance instanceof BrowserEditor) ?? null;
    }
    const browserEditor = browserPage?.mainEditorInstance;
    if (!(browserEditor instanceof BrowserEditor)) {
        return { error: { code: -32602, message: "No browser page open. Use the 'open_url' tool to open a browser page." } };
    }

    // Ensure the browser page is active (webview needs display != none for focus/input)
    if (browserPage !== activePage) {
        pagesModel.showPage(browserPage.id);
    }

    const state = browserEditor.state.get();
    if (state.isIncognito) {
        return { error: { code: -32602, message: "Active browser page is in incognito mode. Browser automation is disabled for privacy protection. Use the 'open_url' tool to open a normal browser page." } };
    }
    if (state.isTor) {
        return { error: { code: -32602, message: "Active browser page is in Tor mode. Browser automation is disabled for privacy protection. Use the 'open_url' tool to open a normal browser page." } };
    }
    return browserEditor.target;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Get composite accessibility snapshot (main frame + iframes + overlay hint). */
async function snapshot(target: IBrowserTarget, tabId?: string): Promise<string> {
    const cdp = target.cdp(tabId);
    const overlayHint = await detectOverlay(cdp);
    const tree = await buildSnapshot(cdp);
    if (overlayHint) {
        return `# ${overlayHint}\n${tree}`;
    }
    return tree;
}

/** Resolve a ref (e.g. "e52") or selector from params. Returns CSS selector or null (if ref). */
function refOrSelector(params: any): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (params?.selector) return params.selector;
    if (params?.ref) return null; // ref is handled separately via callOnRef
    if (params?.element) return params.element; // human-readable fallback
    return null;
}


// ── Command Handlers ────────────────────────────────────────────────

async function browserNavigate(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const url = params?.url;
    if (!url) return { error: { code: -32602, message: "Missing 'url' parameter" } };

    // Capture current URL so we can detect when navigation starts.
    // navigate() triggers a React state update — the webview picks up the new src
    // via a React effect (async), so we must wait for that gap before polling readyState.
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

    return { result: await snapshot(target) };
}

async function browserSnapshot(target: IBrowserTarget): Promise<McpResponse> {
    return { result: await snapshot(target) };
}

async function browserClick(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    target.focusWebview();
    const selector = refOrSelector(params);
    if (selector) {
        const s = JSON.stringify(selector);
        await target.cdp().evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            el.scrollIntoView({ block: 'center' });
            el.click();
        })()`);
    } else if (params?.ref) {
        await callOnRef(target.cdp(), params.ref,
            "function() { this.scrollIntoView({block:'center'}); this.click(); }");
    } else {
        return { error: { code: -32602, message: "Missing 'selector' or 'ref' parameter" } };
    }
    return { result: await snapshot(target) };
}

async function browserHover(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    target.focusWebview();
    const hoverJs = `
        this.scrollIntoView({block:'center'});
        this.dispatchEvent(new MouseEvent('mouseenter', {bubbles:false, composed:true}));
        this.dispatchEvent(new MouseEvent('mouseover',  {bubbles:true,  composed:true}));
    `;
    const selector = refOrSelector(params);
    if (selector) {
        const s = JSON.stringify(selector);
        await target.cdp().evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            ${hoverJs.replace(/this/g, "el")}
        })()`);
    } else if (params?.ref) {
        await callOnRef(target.cdp(), params.ref,
            `function() { ${hoverJs} }`);
    } else {
        return { error: { code: -32602, message: "Missing 'selector' or 'ref' parameter" } };
    }
    return { result: await snapshot(target) };
}

async function browserType(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const text = params?.text;
    if (text == null) return { error: { code: -32602, message: "Missing 'text' parameter" } };
    const selector = refOrSelector(params);
    if (!selector && !params?.ref) {
        return { error: { code: -32602, message: "Missing 'selector' or 'ref' parameter" } };
    }

    await typeText(target, {
        selector: selector || undefined,
        ref: params?.ref,
        text,
        slowly: params?.slowly,
        submit: params?.submit,
    });

    return { result: await snapshot(target) };
}

async function browserSelectOption(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    // Accept Playwright-style `values` array or our own `value` string
    const value = params?.value ?? (Array.isArray(params?.values) ? params.values[0] : params?.values);
    if (value == null) return { error: { code: -32602, message: "Missing 'value' or 'values' parameter" } };
    const selector = refOrSelector(params);
    if (selector) {
        const s = JSON.stringify(selector);
        await target.cdp().evaluate(`(() => {
            const el = document.querySelector(${s});
            if (!el) throw new Error('Element not found: ' + ${s});
            el.value = ${JSON.stringify(value)};
            el.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
    } else if (params?.ref) {
        await callOnRef(target.cdp(), params.ref,
            `function() { this.value = ${JSON.stringify(value)}; this.dispatchEvent(new Event('change',{bubbles:true})); }`);
    } else {
        return { error: { code: -32602, message: "Missing 'selector' or 'ref' parameter" } };
    }
    return { result: await snapshot(target) };
}

async function browserPressKey(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const key = params?.key;
    if (!key) return { error: { code: -32602, message: "Missing 'key' parameter" } };
    target.focusWebview();
    await pressKey(target.cdp(), key);
    return { result: await snapshot(target) };
}

async function browserEvaluate(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    let expression = params?.expression ?? params?.function;
    if (!expression) return { error: { code: -32602, message: "Missing 'expression' or 'function' parameter" } };
    // Only auto-invoke when using the Playwright-style `function` param.
    // If the caller used `expression`, respect it as-is — they may intentionally want a function reference.
    if (params?.function && (/^\s*(async\s+)?\(/.test(expression) || /^\s*(async\s+)?function/.test(expression))) {
        expression = `(${expression})()`;
    }
    const value = await target.cdp().evaluate(expression);
    return { result: value };
}

async function browserGetTabs(target: IBrowserTarget, params: Record<string, unknown> | undefined): Promise<McpResponse> {
    const action = params?.action ?? "list";

    switch (action) {
        case "list":
            return { result: target.tabs };

        case "new": {
            target.addTab(params?.url as string | undefined);
            await new Promise(resolve => setTimeout(resolve, 200));
            return { result: target.tabs };
        }

        case "close": {
            const tabs = target.tabs;
            const idx = params?.index as number | undefined;
            if (idx != null) {
                const tab = tabs[idx];
                if (!tab) return { error: { code: -32602, message: `No tab at index ${idx}` } };
                target.closeTab(tab.id);
            } else {
                target.closeTab();
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            return { result: target.tabs };
        }

        case "select": {
            const tabs = target.tabs;
            const idx = params?.index as number | undefined;
            if (idx == null) return { error: { code: -32602, message: "Missing 'index' for action 'select'" } };
            const tab = tabs[idx];
            if (!tab) return { error: { code: -32602, message: `No tab at index ${idx}` } };
            target.switchTab(tab.id);
            return { result: target.tabs };
        }

        default:
            return { error: { code: -32602, message: `Unknown action '${action}'. Use: list, new, close, select` } };
    }
}

async function browserNavigateBack(target: IBrowserTarget): Promise<McpResponse> {
    const oldUrl = await target.cdp().evaluate('document.location.href').catch(() => '');
    target.back();

    // Phase 1: wait for navigation to start (same race-condition fix as browserNavigate).
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

    return { result: await snapshot(target) };
}

async function browserWaitFor(target: IBrowserTarget, params: any): Promise<McpResponse> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const selector = params?.selector;
    const text = params?.text;
    const textGone = params?.textGone;
    const time = params?.time;           // seconds (Playwright style)
    const timeout = params?.timeout ?? 30000;

    if (time != null) {
        // Wait a fixed number of seconds (Playwright-style)
        await new Promise(resolve => setTimeout(resolve, Math.round(time * 1000)));
    } else if (selector) {
        const s = JSON.stringify(selector);
        await target.cdp().evaluate(`new Promise((resolve, reject) => {
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
    } else if (text) {
        // Wait for text to appear anywhere on the page
        const escaped = text.replace(/"/g, '\\"');
        await target.cdp().evaluate(`new Promise((resolve, reject) => {
            const check = () => {
                if (document.body?.innerText?.includes(${JSON.stringify(text)})) { resolve(true); return; }
                if (Date.now() - start > ${timeout}) {
                    reject(new Error('Timeout waiting for text: "${escaped}"'));
                    return;
                }
                requestAnimationFrame(check);
            };
            const start = Date.now();
            check();
        })`);
    } else if (textGone != null) {
        // Wait until textGone is no longer visible on the page (Playwright-style)
        const escaped = textGone.replace(/"/g, '\\"');
        await target.cdp().evaluate(`new Promise((resolve, reject) => {
            const check = () => {
                if (!document.body?.innerText?.includes(${JSON.stringify(textGone)})) { resolve(true); return; }
                if (Date.now() - start > ${timeout}) {
                    reject(new Error('Timeout waiting for text to disappear: "${escaped}"'));
                    return;
                }
                requestAnimationFrame(check);
            };
            const start = Date.now();
            check();
        })`);
    } else {
        return { error: { code: -32602, message: "Missing 'selector', 'text', 'textGone', or 'time' parameter" } };
    }
    return { result: await snapshot(target) };
}

async function browserTakeScreenshot(target: IBrowserTarget): Promise<McpResponse> {
    const cdp = target.cdp();
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    return { result: { type: "image", data, mimeType: "image/png" } };
}

async function browserNetworkRequests(target: IBrowserTarget): Promise<McpResponse> {
    const activeTab = target.activeTab;
    if (!activeTab) return { error: { code: -32602, message: "No active tab" } };
    const regKey = `${target.id}/${activeTab.id}`;
    const log = await ipcRenderer.invoke(BrowserChannel.getNetworkLog, regKey);
    return { result: log };
}

async function browserClose(target: IBrowserTarget): Promise<McpResponse> {
    target.closeTab();
    return { result: "Tab closed" };
}

// ── Public Dispatch ─────────────────────────────────────────────────

/**
 * Dispatch a browser automation command.
 * Called from mcp-handler.ts for any method starting with "browser_".
 */
export async function handleBrowserCommand(
    command: string,
    params: any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<McpResponse> {
    if (!settings.get("mcp.browser-tools.enabled")) {
        return { error: { code: -32602, message: "Browser interaction is disabled. Enable it in Settings → MCP Server → 'Enable browser interaction'." } };
    }
    const target = await getTarget();
    if (isErrorResponse(target)) return target;

    switch (command) {
        case "browser_navigate":        return browserNavigate(target, params);
        case "browser_snapshot":        return browserSnapshot(target);
        case "browser_click":           return browserClick(target, params);
        case "browser_hover":           return browserHover(target, params);
        case "browser_type":            return browserType(target, params);
        case "browser_select_option":   return browserSelectOption(target, params);
        case "browser_press_key":       return browserPressKey(target, params);
        case "browser_evaluate":        return browserEvaluate(target, params);
        case "browser_tabs":            return browserGetTabs(target, params);
        case "browser_navigate_back":   return browserNavigateBack(target);
        case "browser_wait_for":        return browserWaitFor(target, params);
        case "browser_take_screenshot": return browserTakeScreenshot(target);
        case "browser_network_requests": return browserNetworkRequests(target);
        case "browser_close":           return browserClose(target);
        default:
            return { error: { code: -32601, message: `Unknown browser command: ${command}` } };
    }
}
