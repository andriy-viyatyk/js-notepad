/**
 * Browser automation MCP command adapter (Playwright-compatible).
 *
 * Parameter parsing and target resolution live here; command behavior is shared by
 * automation/operations.ts so facades and MCP commands cannot diverge.
 */
import { pagesModel } from "../api/pages";
import type { PageModel } from "../api/pages/PageModel";
// Type-only imports: automation/ is a leaf that must NOT pull editor modules into
// its bundle (they are dynamic-import isolated). We narrow by the duck-typed
// `editorId` discriminator below — the `import type` is erased at build, so no
// runtime dependency on BrowserEditor / BoardEditorModel is created.
import type { BrowserEditor } from "../editors/browser";
import type { BoardEditorModel } from "../editors/board/BoardEditorModel";
import { isBoardEditorId } from "../editors/board/custom-editor-registry";
import { agentMayAccessBrowserPage, privateBrowserRefusal } from "../editors/browser/agent-access";
import { appTarget } from "./AppTargetModel";
import {
    closeActiveTab,
    closeTab,
    clickElement,
    ensureTargetReady,
    evaluateInTarget,
    hoverElement,
    listTabs,
    navigateAndWait,
    navigateBackAndWait,
    networkRequests,
    openTab,
    pressKeyOnTarget,
    selectOption,
    selectTab,
    snapshot,
    takeScreenshot,
    typeTextInto,
    waitFor,
    type ElementLocator,
} from "./operations";
import type { IBrowserTarget } from "./types";
import { errMessage } from "../../shared/utils";

interface McpResponse {
    result?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    error?: { code: number; message: string; data?: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

function isBrowserEditor(e: unknown): e is BrowserEditor {
    return !!e && (e as { editorId?: string }).editorId === "browser-view";
}

function isBoardEditor(e: unknown): e is BoardEditorModel {
    return !!e && isBoardEditorId((e as { editorId?: string }).editorId);
}

/** Discriminate the error-response branch of `getTarget()`. */
function isErrorResponse(t: IBrowserTarget | McpResponse): t is McpResponse {
    return "error" in t;
}

/**
 * Resolve the automation target for a browser command.
 *
 * Resolution precedence:
 *   0. `pageId === "app"` — Persephone's OWN main window (explicit only).
 *   1. `pageId` — exact page (must be a browser page or board).
 *   2. `profileName` — first browser page of that profile.
 *   3. neither — the ACTIVE browser page, else the FIRST browser page.
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
    // the app window and read that session straight off the rendered UI. The whole app window
    // is therefore refused while a private page is the active one.
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
                    + "— read `pages` to choose one, then call `pages.showPage(pageId)` — and retry."
                } };
            }
        }
        return appTarget;
    }

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
        const matches = (p: PageModel) => {
            const e = p.mainEditorInstance;
            if (!isBrowserEditor(e)) return false;
            const s = e.state.get();
            return !s.isIncognito && !s.isTor && (s.profileName ?? "") === profileName;
        };
        targetPage = (activePage && matches(activePage) ? activePage : null)
            ?? pages.find(matches) ?? null;
        if (!targetPage) {
            return { error: { code: -32602, message: `No browser page with profile '${profileName || "default"}'. Call pages.showBrowserPage({ profileName }) or pages.openUrlInBrowserTab(url, { profileName }) to open one.` } };
        }
    } else {
        targetPage = isAutomatable(activePage) ? activePage ?? null : null;
        if (!targetPage) {
            targetPage = pages.find((p) => isBrowserEditor(p.mainEditorInstance))
                ?? pages.find((p) => isBoardEditor(p.mainEditorInstance))
                ?? null;
        }
    }

    const editor = targetPage?.mainEditorInstance;

    if (isBoardEditor(editor)) {
        if (targetPage !== activePage) pagesModel.showPage(targetPage.id);
        return editor.target;
    }

    if (!isBrowserEditor(editor)) {
        return { error: { code: -32602, message: "No automatable page open. Call pages.openUrlInBrowserTab(url) to open a browser page, or open a board." } };
    }

    if (targetPage !== activePage) pagesModel.showPage(targetPage.id);

    const state = editor.state.get();
    if (!agentMayAccessBrowserPage(state)) {
        return { error: { code: -32602, message: privateBrowserRefusal(state, "browser tools") } };
    }
    return editor.target;
}

/** Preserve the MCP adapter's selector/ref/element precedence. */
function refOrSelector(params: any): string | null { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (params?.selector) return params.selector;
    if (params?.ref) return null;
    if (params?.element) return params.element;
    return null;
}

function parseMcpLocator(params: any): ElementLocator | null { // eslint-disable-line @typescript-eslint/no-explicit-any
    const selector = refOrSelector(params);
    if (selector) return { selector };
    if (params?.ref) return { ref: params.ref };
    return null;
}

function missingLocator(): McpResponse {
    return { error: { code: -32602, message: "Missing 'selector' or 'ref' parameter" } };
}

/** Dispatch a browser automation command after MCP-only parsing and target resolution. */
export async function handleBrowserCommand(
    command: string,
    params: any, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<McpResponse> {
    const target = await getTarget(params);
    if (isErrorResponse(target)) return target;

    // Preserve the existing readiness position: before command dispatch and outside its error
    // conversion. This is a no-op for browser pages and the app window.
    await ensureTargetReady(target);

    try {
        switch (command) {
            case "browser_navigate": {
                const url = params?.url;
                if (!url) return { error: { code: -32602, message: "Missing 'url' parameter" } };
                await navigateAndWait(target, url);
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            }
            case "browser_snapshot":
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            case "browser_click": {
                const locator = parseMcpLocator(params);
                if (!locator) {
                    target.focusWebview();
                    return missingLocator();
                }
                await clickElement(target, locator);
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            }
            case "browser_hover": {
                const locator = parseMcpLocator(params);
                if (!locator) {
                    target.focusWebview();
                    return missingLocator();
                }
                await hoverElement(target, locator);
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            }
            case "browser_type": {
                const text = params?.text;
                if (text == null) return { error: { code: -32602, message: "Missing 'text' parameter" } };
                const locator = parseMcpLocator(params);
                if (!locator) return missingLocator();
                await typeTextInto(target, locator, text, {
                    slowly: params?.slowly,
                    submit: params?.submit,
                });
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            }
            case "browser_select_option": {
                const value = params?.value ?? (Array.isArray(params?.values) ? params.values[0] : params?.values);
                if (value == null) return { error: { code: -32602, message: "Missing 'value' or 'values' parameter" } };
                const locator = parseMcpLocator(params);
                if (!locator) return missingLocator();
                await selectOption(target, locator, value);
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            }
            case "browser_press_key": {
                const key = params?.key;
                if (!key) return { error: { code: -32602, message: "Missing 'key' parameter" } };
                await pressKeyOnTarget(target, key);
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            }
            case "browser_evaluate": {
                let expression = params?.expression ?? params?.function;
                if (!expression) return { error: { code: -32602, message: "Missing 'expression' or 'function' parameter" } };
                // Only auto-invoke when using the Playwright-style `function` param.
                if (params?.function && (/^\s*(async\s+)?\(/.test(expression) || /^\s*(async\s+)?function/.test(expression))) {
                    expression = `(${expression})()`;
                }
                return { result: await evaluateInTarget(target, expression) };
            }
            case "browser_tabs": {
                const action = params?.action ?? "list";
                switch (action) {
                    case "list":
                        return { result: listTabs(target) };
                    case "new":
                        return { result: await openTab(target, params?.url as string | undefined) };
                    case "close":
                        return { result: await closeTab(target, params?.index as number | undefined) };
                    case "select": {
                        const index = params?.index as number | undefined;
                        if (index == null) return { error: { code: -32602, message: "Missing 'index' for action 'select'" } };
                        return { result: await selectTab(target, index) };
                    }
                    default:
                        return { error: { code: -32602, message: `Unknown action '${action}'. Use: list, new, close, select` } };
                }
            }
            case "browser_navigate_back":
                await navigateBackAndWait(target);
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            case "browser_wait_for": {
                const selector = params?.selector;
                const text = params?.text;
                const textGone = params?.textGone;
                const time = params?.time;
                const timeout = params?.timeout ?? 30000;
                if (time != null) {
                    await waitFor(target, { mode: { kind: "time", seconds: time }, timeout });
                } else if (selector) {
                    await waitFor(target, { mode: { kind: "selector", selector }, timeout });
                } else if (text) {
                    await waitFor(target, { mode: { kind: "text", text }, timeout });
                } else if (textGone != null) {
                    await waitFor(target, { mode: { kind: "textGone", text: textGone }, timeout });
                } else {
                    return { error: { code: -32602, message: "Missing 'selector', 'text', 'textGone', or 'time' parameter" } };
                }
                return { result: await snapshot(target, undefined, { overlayHint: true }) };
            }
            case "browser_take_screenshot":
                return { result: await takeScreenshot(target) };
            case "browser_network_requests":
                return { result: await networkRequests(target) };
            case "browser_close":
                return { result: closeActiveTab(target) };
            default:
                return { error: { code: -32601, message: `Unknown browser command: ${command}` } };
        }
    } catch (err) {
        return { error: { code: -32602, message: errMessage(err) } };
    }
}
