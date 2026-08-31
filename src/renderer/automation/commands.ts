/**
 * Browser automation MCP command handlers (Playwright-compatible).
 *
 * Extracted from mcp-handler.ts — all browser_* tool logic lives here.
 * Uses IBrowserTarget for browser access, keeping this module
 * independent of the browser editor's internal implementation.
 */
const { ipcRenderer } = require("electron"); // eslint-disable-line @typescript-eslint/no-var-requires
import { pagesModel } from "../api/pages";
import type { PageModel } from "../api/pages/PageModel";
import { settings } from "../api/settings";
import { BrowserChannel } from "../../ipc/browser-ipc";
// Type-only imports: automation/ is a leaf that must NOT pull editor modules into
// its bundle (they are dynamic-import isolated). We narrow by the duck-typed
// `editorId` discriminator below — the `import type` is erased at build, so no
// runtime dependency on BrowserEditor / BoardEditorModel is created.
import type { BrowserEditor } from "../editors/browser";
import type { BoardEditorModel } from "../editors/board/BoardEditorModel";
import { isBoardEditorId } from "../editors/board/custom-editor-registry";
import { pressKey, typeText } from "./input";
import { callOnRef } from "./ref";
import { buildSnapshot, detectOverlay } from "./snapshot";
import type { IBrowserTarget } from "./types";
// Value import is safe: AppTargetModel is a leaf (only types + CdpSession + an
// api-types constant) and pulls no editor modules into this bundle.
import { appTarget } from "./AppTargetModel";
import { errMessage } from "../../shared/utils";

// ── Types ───────────────────────────────────────────────────────────

interface McpResponse {
    result?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    error?: { code: number; message: string; data?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ── Editor discriminators (duck-typed) ──────────────────────────────
// Narrow by the `editorId` discriminator rather than `instanceof`, so this
// module needs no runtime import of the editor classes (see the type-only
// imports above). The `import type` gives back the real types for narrowing.

function isBrowserEditor(e: unknown): e is BrowserEditor {
    return !!e && (e as { editorId?: string }).editorId === "browser-view";
}

function isBoardEditor(e: unknown): e is BoardEditorModel {
    return !!e && isBoardEditorId((e as { editorId?: string }).editorId);
}

// ── Target Resolution ───────────────────────────────────────────────

/** Discriminate the error-response branch of `getTarget()`. Needed because
 *  `McpResponse.error` is optional, so `"error" in target` alone doesn't
 *  narrow the union for TS. */
function isErrorResponse(t: IBrowserTarget | McpResponse): t is McpResponse {
    return "error" in t;
}

/**
 * Resolve the automation target for a browser command.
 *
 * Resolution precedence:
 *   0. `pageId === "app"` — Persephone's OWN main window (the app UI itself). Explicit
 *                      only; never reachable by the fallback branch below. Refused while the
 *                      ACTIVE page is an incognito/Tor browser, which would otherwise be readable
 *                      off the rendered UI.
 *   1. `pageId`      — exact page (must be a browser page).
 *   2. `profileName` — first browser page of that profile ("" = default profile;
 *                      never matches incognito/tor). Prefers the active page.
 *   3. neither       — the ACTIVE browser page, else the FIRST browser page.
 *
 * The resolved page is activated (the webview needs display != none for focus/input),
 * and incognito/Tor pages are blocked for privacy (after resolution).
 */
async function getTarget(
    params?: { pageId?: unknown; profileName?: unknown },
): Promise<IBrowserTarget | McpResponse> {
    const pages = pagesModel.state.get().pages;
    const activePage = pagesModel.activePage;
    const pageId = typeof params?.pageId === "string" ? params.pageId : undefined;
    const profileName = typeof params?.profileName === "string" ? params.profileName : undefined;

    // The app window (US-810) is automatable via the "app" sentinel — it drives
    // Persephone's own UI. Explicit only: the fallback branch must NEVER return
    // it, so an agent aiming at a web page can't accidentally click the app chrome.
    //
    // The incognito/Tor block below guards the *browser* target, and this branch used to return
    // before reaching it — so an agent barred from driving a private session could still aim at
    // the app window and read that session straight off the rendered UI. The whole app window is
    // one surface: `browser_take_screenshot` captures the private page's pixels, and almost every
    // app-window command (`browser_click`, `browser_hover`, `browser_type`, `browser_press_key`,
    // `browser_wait_for`, ...) returns a full-window `snapshot()` as its result, so gating only the
    // two obviously-capturing commands would be bypassed by any one of the others. The whole app
    // target is therefore refused while a private page is the active one.
    //
    // Only the ACTIVE page matters: a private page that is not active is `display: none`, so it is
    // in neither the snapshot nor the screenshot. That is also what makes the remedy honest —
    // activating any other page genuinely removes the exposure rather than just hiding it.
    if (pageId === "app") {
        const activeEditor = activePage?.mainEditorInstance;
        if (isBrowserEditor(activeEditor)) {
            const activeState = activeEditor.state.get();
            const mode = activeState.isTor ? "Tor" : activeState.isIncognito ? "incognito" : undefined;
            if (mode) {
                return { error: { code: -32602, message:
                    `The active page is a browser in ${mode} mode, so Persephone's own UI (pageId: "app") `
                    + "cannot be automated right now: app-window commands capture or return a snapshot of the "
                    + "whole window, which would expose that private session. Activate a different page first "
                    + "— list_pages to choose one, then execute_script with app.pages.showPage(pageId) — and retry."
                } };
            }
        }
        return appTarget;
    }

    // A board (EPIC-034 / US-730) is automatable just like a browser page — both
    // expose an IBrowserTarget. Only the Browser editor carries profile/incognito/Tor.
    const isAutomatable = (p: PageModel | undefined | null): boolean => {
        const e = p?.mainEditorInstance;
        return isBrowserEditor(e) || isBoardEditor(e);
    };

    let targetPage: PageModel | null = null;
    if (pageId) {
        const page = pagesModel.findPage(pageId);
        if (!page) {
            return { error: { code: -32602, message: `Page not found: ${pageId}` } };
        }
        if (!isAutomatable(page)) {
            return { error: { code: -32602, message: `Page ${pageId} is not an automatable page (open a browser page or a board).` } };
        }
        targetPage = page;
    } else if (profileName !== undefined) {
        // Profiles are browser-only. "" targets the default profile; prefer the active page if it matches.
        const matches = (p: PageModel) => {
            const e = p.mainEditorInstance;
            if (!isBrowserEditor(e)) return false;
            const s = e.state.get();
            return !s.isIncognito && !s.isTor && (s.profileName ?? "") === profileName;
        };
        targetPage = (activePage && matches(activePage) ? activePage : null)
            ?? pages.find(matches) ?? null;
        if (!targetPage) {
            return { error: { code: -32602, message: `No browser page with profile '${profileName || "default"}'. Use the 'open_url' tool with profileName to open one.` } };
        }
    } else {
        // Prefer the active page if it's automatable; else first browser page; else first board.
        targetPage = isAutomatable(activePage) ? activePage ?? null : null;
        if (!targetPage) {
            targetPage = pages.find((p) => isBrowserEditor(p.mainEditorInstance))
                ?? pages.find((p) => isBoardEditor(p.mainEditorInstance))
                ?? null;
        }
    }

    const editor = targetPage?.mainEditorInstance;

    // Board: no profile / incognito / Tor — just ensure it's the shown page (the
    // webview needs display != none for focus/input) and return its target.
    if (isBoardEditor(editor)) {
        if (targetPage !== activePage) {
            pagesModel.showPage(targetPage.id);
        }
        return editor.target;
    }

    if (!isBrowserEditor(editor)) {
        return { error: { code: -32602, message: "No automatable page open. Use the 'open_url' tool to open a browser page, or open a board." } };
    }

    // Ensure the browser page is active (webview needs display != none for focus/input)
    if (targetPage !== activePage) {
        pagesModel.showPage(targetPage.id);
    }

    const state = editor.state.get();
    if (state.isIncognito) {
        return { error: { code: -32602, message: "Active browser page is in incognito mode. Browser automation is disabled for privacy protection. Use the 'open_url' tool to open a normal browser page." } };
    }
    if (state.isTor) {
        return { error: { code: -32602, message: "Active browser page is in Tor mode. Browser automation is disabled for privacy protection. Use the 'open_url' tool to open a normal browser page." } };
    }
    return editor.target;
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
            // Await: a board `switchTab` auto-expands the secondary panel and waits for its
            // frame to be CDP-attachable, so the next command can't race an unmounted frame.
            // `await` on a synchronous `void` return (the browser target) is a harmless no-op.
            await target.switchTab(tab.id);
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
    const target = await getTarget(params);
    if (isErrorResponse(target)) return target;
    // Readiness gate (US-858): if the active tab is a board secondary view whose frame isn't
    // attachable yet (panel closed / still loading), expand + wait so the command below
    // succeeds instead of hitting an unmounted frame. No-op for browser pages / the main frame.
    await target.ensureReady?.();

    const dispatch = (): Promise<McpResponse> | McpResponse => {
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
    };

    // A board target throws on navigation/tab commands (unsupported); turn any
    // thrown/rejected command into a clean JSON-RPC error rather than crashing.
    try {
        const result = await dispatch();
        return result;
    } catch (err) {
        return { error: { code: -32602, message: errMessage(err) } };
    }
}
