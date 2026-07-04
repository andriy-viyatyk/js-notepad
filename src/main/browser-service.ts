/**
 * Main process browser service.
 *
 * Manages webContents for browser tab webviews. When a renderer registers
 * a webview by its webContentsId, this service attaches event listeners
 * on the actual webContents and relays events back to the renderer via IPC.
 * This provides reliable events (e.g. page-favicon-updated fires consistently)
 * compared to the <webview> DOM element's event API.
 *
 * Registration key is `${tabId}/${internalTabId}` to support multiple
 * internal browser tabs per persephone page tab.
 */
import { app, BrowserWindow, dialog, ipcMain, IpcMainEvent, session, webContents, WebContents, WebFrameMain } from "electron";
import * as cheerio from "cheerio";
import {
    BrowserChannel,
    BrowserRegisterRequest,
    BrowserEvent,
} from "../ipc/browser-ipc";
import { globalPopupRateLimiter } from "../ipc/popup-rate-limiter";
import { initNetworkLogger, setWebContentsResolver, clearNetworkLog } from "./network-logger";
import { initCdpHandlers } from "./cdp-service";

const BLOCKED_PROTOCOLS = ["file:", "app-asset:", "safe-file:"];

/** Generic event-listener shape — used for storing handlers we attach to
 *  WebContents. WebContents extends EventEmitter; this matches that surface
 *  while letting us bypass Electron's per-event overloaded `on()` types. */
type AnyEventHandler = (...args: unknown[]) => void;
interface EventTarget {
    on(event: string, handler: AnyEventHandler): void;
    removeListener(event: string, handler: AnyEventHandler): void;
}

// Track sessions whose User-Agent has already been cleaned
const cleanedSessions = new WeakSet<Electron.Session>();

/**
 * Strip app name and Electron version from User-Agent so websites
 * see a standard Chrome UA instead of "persephone/x.x.x ... Electron/x.x.x".
 */
function cleanUserAgent(ses: Electron.Session): void {
    if (cleanedSessions.has(ses)) return;
    cleanedSessions.add(ses);
    const ua = ses.getUserAgent()
        .replace(/\s*persephone\/\S+/i, "")
        .replace(/\s*Electron\/\S+/i, "");
    ses.setUserAgent(ua);
}

/** Extract a numeric value from a window.open() features string (e.g. "width=500,height=600"). */
function parseFeature(features: string, name: string): number | undefined {
    const match = features.match(new RegExp(`${name}=(\\d+)`));
    return match ? parseInt(match[1], 10) : undefined;
}

interface RegisteredWebview {
    tabId: string;
    internalTabId: string;
    webContents: WebContents;
    senderWebContents: WebContents;
    listeners: Array<{ event: string; handler: AnyEventHandler }>;
    /** One-shot: when true, the next will-prevent-unload is allowed without a
     *  confirmation prompt. Armed by a hard reload (Ctrl+F5 / Ctrl+Shift+R from
     *  either keyboard path), consumed by the will-prevent-unload handler, and
     *  cleared defensively on did-stop-loading so it can never leak to a later
     *  reload if no prompt was triggered. */
    bypassUnloadGuard: boolean;
}

// Active registrations: `${tabId}/${internalTabId}` → registration
const registrations = new Map<string, RegisteredWebview>();

// Track senders that already have a "destroyed" listener to avoid stacking
const watchedSenders = new WeakSet<WebContents>();

function regKey(tabId: string, internalTabId: string): string {
    return `${tabId}/${internalTabId}`;
}

function sendEvent(
    sender: WebContents,
    tabId: string,
    internalTabId: string,
    type: BrowserEvent["type"],
    data: BrowserEvent["data"],
) {
    try {
        if (!sender.isDestroyed()) {
            const event: BrowserEvent = { tabId, internalTabId, type, data };
            sender.send(BrowserChannel.event, event);
        }
    } catch {
        // Sender may have been destroyed
    }
}

/**
 * Guard a popup window opened by a webview. Blocks popups from the child
 * until the user has explicitly focused (activated) the window. This prevents
 * cascade attacks where each popup opens the next without user interaction.
 * Applied recursively to any grandchild windows.
 */
function guardPopupWindow(
    childWindow: BrowserWindow,
    sender: WebContents,
    tabId: string,
    internalTabId: string,
) {
    let userActivated = false;

    // Mark as activated when the user focuses the window
    childWindow.once("focus", () => {
        userActivated = true;
    });

    const childWc = childWindow.webContents;

    childWc.setWindowOpenHandler(({ url, disposition, features }) => {
        // Link clicks → open as internal tab in the parent page
        if (disposition === "foreground-tab" || disposition === "background-tab") {
            sendEvent(sender, tabId, internalTabId, "new-window", {
                url,
                disposition,
            });
            return { action: "deny" };
        }

        // Block popups from windows the user hasn't activated
        if (!userActivated) {
            sendEvent(sender, tabId, internalTabId, "popups-blocked", { url });
            return { action: "deny" };
        }

        // User-activated window: apply global rate limiting
        if (!globalPopupRateLimiter.isAllowed("popups") && !globalPopupRateLimiter.check("popups")) {
            sendEvent(sender, tabId, internalTabId, "popups-blocked", { url });
            return { action: "deny" };
        }

        // Center on the child window
        const parentBounds = childWindow.getBounds();
        const popupWidth = parseFeature(features, "width") || 500;
        const popupHeight = parseFeature(features, "height") || 600;

        return {
            action: "allow",
            overrideBrowserWindowOptions: {
                autoHideMenuBar: true,
                width: popupWidth,
                height: popupHeight,
                x: Math.round(parentBounds.x + (parentBounds.width - popupWidth) / 2),
                y: Math.round(parentBounds.y + (parentBounds.height - popupHeight) / 2),
            },
        };
    });

    // Recursively guard grandchild windows
    childWc.on("did-create-window", (grandchild) => {
        guardPopupWindow(grandchild, sender, tabId, internalTabId);
    });
}

function registerWebview(event: IpcMainEvent, request: BrowserRegisterRequest) {
    const { tabId, internalTabId, webContentsId } = request;
    const key = regKey(tabId, internalTabId);

    // Clean up any previous registration for this key
    unregisterWebview(key);

    const wc = webContents.fromId(webContentsId);
    if (!wc) return;

    const sender = event.sender;
    const listeners: RegisteredWebview["listeners"] = [];

    const wcEvents = wc as unknown as EventTarget;
    function on<T extends string>(
        eventName: T,
        handler: AnyEventHandler,
    ) {
        wcEvents.on(eventName, handler);
        listeners.push({ event: eventName, handler });
    }

    on("did-navigate", (_e: Electron.Event, url: string) => {
        sendEvent(sender, tabId, internalTabId, "did-navigate", {
            url,
            canGoBack: wc.canGoBack(),
            canGoForward: wc.canGoForward(),
        });
    });

    on("did-navigate-in-page", (_e: Electron.Event, url: string, isMainFrame: boolean) => {
        if (isMainFrame) {
            sendEvent(sender, tabId, internalTabId, "did-navigate-in-page", {
                url,
                canGoBack: wc.canGoBack(),
                canGoForward: wc.canGoForward(),
                isMainFrame,
            });
        }
    });

    on("page-title-updated", (_e: Electron.Event, title: string) => {
        sendEvent(sender, tabId, internalTabId, "page-title-updated", {
            title,
        });
    });

    on("page-favicon-updated", (_e: Electron.Event, favicons: string[]) => {
        if (favicons && favicons.length > 0) {
            sendEvent(sender, tabId, internalTabId, "page-favicon-updated", {
                favicon: favicons[0],
            });
        }
    });

    on("did-start-loading", () => {
        sendEvent(sender, tabId, internalTabId, "did-start-loading", {});
    });

    on("did-stop-loading", () => {
        // Defensive: clear a hard-reload bypass that was set but never consumed
        // (e.g. the page had no beforeunload guard, so no prompt fired).
        const reg = registrations.get(key);
        if (reg) reg.bypassUnloadGuard = false;
        sendEvent(sender, tabId, internalTabId, "did-stop-loading", {});
    });

    // A page with a beforeunload handler (e.g. an unsaved-changes guard) tries
    // to cancel reloads/navigations. Electron's default is to SILENTLY cancel
    // the unload — no prompt, no reload — which makes Reload/F5 appear dead.
    // Surface a confirmation instead: "Leave" allows the unload (reload
    // proceeds), "Cancel" keeps the page. A hard reload (Ctrl+F5 /
    // Ctrl+Shift+R) arms bypassUnloadGuard to skip the prompt and force through.
    on("will-prevent-unload", (event: Electron.Event) => {
        const reg = registrations.get(key);
        if (reg?.bypassUnloadGuard) {
            reg.bypassUnloadGuard = false;
            event.preventDefault(); // allow unload — reload without prompting
            return;
        }
        const parentWindow = BrowserWindow.fromWebContents(sender);
        const options: Electron.MessageBoxSyncOptions = {
            type: "question",
            buttons: ["Leave", "Cancel"],
            defaultId: 1,
            cancelId: 1,
            title: "Unsaved changes",
            message: "You have unsaved changes. Leave the page and discard them?",
        };
        const choice = parentWindow
            ? dialog.showMessageBoxSync(parentWindow, options)
            : dialog.showMessageBoxSync(options);
        if (choice === 0) {
            event.preventDefault(); // user chose Leave — allow the unload/reload
        }
    });

    on("audio-state-changed", (e: Electron.Event & { audible: boolean }) => {
        sendEvent(sender, tabId, internalTabId, "audio-state-changed", {
            audible: e.audible,
        });
    });

    // Block page-initiated navigations to dangerous protocols.
    // will-navigate fires only for navigations triggered by the page
    // (links, window.location, forms) — NOT for programmatic loadURL().
    // This allows app-initiated file:// navigations (MCP, restore) while
    // blocking third-party sites from redirecting to local files.
    on("will-navigate", (event: Electron.Event, url: string) => {
        try {
            const parsed = new URL(url);
            if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
                event.preventDefault();
                sendEvent(
                    sender,
                    tabId,
                    internalTabId,
                    "did-start-navigation",
                    { url, blocked: true },
                );
            }
        } catch {
            // Invalid URL
        }
    });

    // Intercept right-click context menu — relay params to renderer
    on("context-menu", (event: Electron.Event, params: Electron.ContextMenuParams) => {
        event.preventDefault();
        sendEvent(sender, tabId, internalTabId, "context-menu", {
            linkURL: params.linkURL || undefined,
            srcURL: params.srcURL || undefined,
            mediaType: params.mediaType !== "none" ? params.mediaType : undefined,
            selectionText: params.selectionText || undefined,
            isEditable: params.isEditable || undefined,
            editFlags: params.editFlags,
            x: params.x,
            y: params.y,
        });
    });

    // Intercept browser hotkeys before the webview consumes them
    on("before-input-event", (_e: Electron.Event, input: Electron.Input) => {
        if (input.type !== "keyDown") return;
        const keyLower = input.key.toLowerCase();
        if (input.key === "F5" || (keyLower === "r" && input.control)) {
            _e.preventDefault();
            if (input.key === "F5" ? input.control : input.shift) {
                // Hard reload (Ctrl+F5 / Ctrl+Shift+R): force through any
                // beforeunload guard without prompting.
                const reg = registrations.get(key);
                if (reg) reg.bypassUnloadGuard = true;
                wc.reloadIgnoringCache();
            } else {
                wc.reload();
            }
        } else if (input.key === "F12") {
            _e.preventDefault();
            wc.openDevTools();
        } else if (input.key === "Escape") {
            _e.preventDefault();
            wc.stop();
            sendEvent(sender, tabId, internalTabId, "hide-find-bar", {});
        } else if (keyLower === "f" && input.control) {
            _e.preventDefault();
            sendEvent(sender, tabId, internalTabId, "show-find-bar", {});
        } else if (input.alt && (input.key === "ArrowLeft" || input.key === "ArrowRight")) {
            _e.preventDefault();
            if (input.key === "ArrowLeft") {
                wc.goBack();
            } else {
                wc.goForward();
            }
        }
    });

    // Intercept window.open / target="_blank"
    wc.setWindowOpenHandler(({ url, disposition, features }) => {
        // Link clicks (target="_blank") → open as internal tab
        if (disposition === "foreground-tab" || disposition === "background-tab") {
            sendEvent(sender, tabId, internalTabId, "new-window", {
                url,
                disposition,
            });
            return { action: "deny" };
        }

        // window.open() from JS (OAuth popups, etc.) → allow as real popup window.
        // This preserves window.opener reference needed by auth flows.
        // Rate-limit to prevent popup spam.
        if (!globalPopupRateLimiter.isAllowed("popups") && !globalPopupRateLimiter.check("popups")) {
            sendEvent(sender, tabId, internalTabId, "popups-blocked", { url });
            return { action: "deny" };
        }

        // Center the popup on the parent window.
        const parentWindow = BrowserWindow.fromWebContents(sender);
        const parentBounds = parentWindow?.getBounds();

        const popupWidth = parseFeature(features, "width") || 500;
        const popupHeight = parseFeature(features, "height") || 600;

        const overrideBrowserWindowOptions: Electron.BrowserWindowConstructorOptions = {
            autoHideMenuBar: true,
            width: popupWidth,
            height: popupHeight,
        };

        if (parentBounds) {
            overrideBrowserWindowOptions.x = Math.round(
                parentBounds.x + (parentBounds.width - popupWidth) / 2,
            );
            overrideBrowserWindowOptions.y = Math.round(
                parentBounds.y + (parentBounds.height - popupHeight) / 2,
            );
        }

        return { action: "allow", overrideBrowserWindowOptions };
    });

    // Block popup chains: child popup windows cannot open more popups
    // unless the user has activated (focused) them first.
    // Must go through on() — registerWebview re-runs on every dom-ready, and
    // only tracked listeners are removed by the unregisterWebview() above.
    on("did-create-window", (childWindow: BrowserWindow) => {
        guardPopupWindow(childWindow, sender, tabId, internalTabId);
    });

    // Clean up if the webview's webContents is destroyed
    on("destroyed", () => {
        unregisterWebview(key);
    });

    // Clean up all registrations for this sender when the renderer window is destroyed.
    // Only attach one listener per sender to avoid exceeding MaxListeners.
    if (!watchedSenders.has(sender)) {
        watchedSenders.add(sender);
        sender.once("destroyed", () => {
            for (const [k, reg] of registrations) {
                if (reg.senderWebContents === sender) {
                    unregisterWebview(k);
                }
            }
        });
    }

    registrations.set(key, {
        tabId,
        internalTabId,
        webContents: wc,
        senderWebContents: sender,
        listeners,
        bypassUnloadGuard: false,
    });
}

function unregisterWebview(key: string) {
    const reg = registrations.get(key);
    if (!reg) return;

    // Remove all event listeners
    for (const { event: eventName, handler } of reg.listeners) {
        try {
            if (!reg.webContents.isDestroyed()) {
                (reg.webContents as unknown as EventTarget).removeListener(eventName, handler);
            }
        } catch {
            // webContents may already be destroyed
        }
    }

    registrations.delete(key);
    clearNetworkLog(key);
}

// =====================================================================
// DOM Collection (View Actual DOM — includes iframe content)
// =====================================================================

/** Compare two URLs ignoring protocol, trailing slashes, and fragment. */
function urlsMatch(a: string, b: string): boolean {
    try {
        const urlA = new URL(a, "http://base");
        const urlB = new URL(b, "http://base");
        const normalize = (u: URL) =>
            (u.hostname + u.pathname).replace(/\/+$/, "") + u.search;
        return normalize(urlA) === normalize(urlB);
    } catch {
        return false;
    }
}

interface FrameResult {
    url: string;
    name: string;
    html: string;
}

/** Inject iframe DOM content inside an <iframe> element. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectIframeContent($: cheerio.CheerioAPI, el: any, result: FrameResult) {
    const $el = $(el);
    const comment = `<!-- IFRAME DOM: src="${result.url}"${result.name ? ` name="${result.name}"` : ""} -->`;
    $el.attr("data-dom-injected", "true");
    $el.html(comment + "\n" + result.html);
}

/**
 * Collect the full DOM from a registered webview, including all iframe content.
 * Uses Electron's WebFrameMain API to iterate all frames in the subtree and
 * cheerio to inject each iframe's DOM into the corresponding <iframe> element.
 */
async function collectDom(key: string): Promise<string> {
    const reg = registrations.get(key);
    if (!reg || reg.webContents.isDestroyed()) return "";

    const mainFrame = reg.webContents.mainFrame;

    // Collect DOM from main frame
    const mainHtml = await mainFrame.executeJavaScript(
        "document.documentElement.outerHTML",
    ) as string;

    // Collect DOM from all child frames
    const childFrames = mainFrame.framesInSubtree.filter(
        (f: WebFrameMain) => f !== mainFrame,
    );
    if (childFrames.length === 0) return mainHtml;

    // Collect each frame's DOM
    const frameResults: FrameResult[] = [];
    for (const frame of childFrames) {
        try {
            const frameHtml = await frame.executeJavaScript(
                "document.documentElement.outerHTML",
            ) as string;
            frameResults.push({
                url: frame.url || "",
                name: frame.name || "",
                html: frameHtml,
            });
        } catch {
            // Frame may have been destroyed or navigated away — skip
        }
    }

    if (frameResults.length === 0) return mainHtml;

    // Use cheerio to find <iframe> elements and inject content
    const $ = cheerio.load(mainHtml, { xml: false });
    const unmatched: FrameResult[] = [];

    for (const result of frameResults) {
        let matched = false;

        // Try to match by src attribute
        if (result.url && result.url !== "about:blank") {
            $("iframe").each((_i, el) => {
                if (matched) return;
                const src = $(el).attr("src") || "";
                if (
                    src &&
                    !$(el).attr("data-dom-injected") &&
                    (result.url.includes(src) ||
                        src.includes(result.url) ||
                        urlsMatch(src, result.url))
                ) {
                    injectIframeContent($, el, result);
                    matched = true;
                    return false; // break .each()
                }
            });
        }

        // Try to match by name attribute
        if (!matched && result.name) {
            $("iframe").each((_i, el) => {
                if (matched) return;
                const name = $(el).attr("name") || "";
                if (name && name === result.name && !$(el).attr("data-dom-injected")) {
                    injectIframeContent($, el, result);
                    matched = true;
                    return false;
                }
            });
        }

        if (!matched) {
            unmatched.push(result);
        }
    }

    // For unmatched frames, try matching by index order
    if (unmatched.length > 0) {
        const emptyIframes = $("iframe").filter((_i, el) => {
            return !$(el).attr("data-dom-injected");
        });

        for (let i = 0; i < unmatched.length && i < emptyIframes.length; i++) {
            injectIframeContent($, emptyIframes[i], unmatched[i]);
        }

        // Any remaining unmatched frames: append at end of body
        for (let i = emptyIframes.length; i < unmatched.length; i++) {
            const result = unmatched[i];
            const comment = `<!-- UNMATCHED IFRAME: src="${result.url}"${result.name ? ` name="${result.name}"` : ""} -->`;
            $("body").append("\n" + comment + "\n" + result.html + "\n");
        }
    }

    return $.html();
}

/**
 * Initialize browser IPC handlers. Call once during app startup.
 */
export function initBrowserHandlers(): void {
    // Clean User-Agent for every browser partition session as soon as it's created.
    // This must happen before any request is made, so we hook session-created
    // rather than waiting for webview registration.
    app.on("session-created", (ses) => {
        cleanUserAgent(ses);
    });

    ipcMain.on(
        BrowserChannel.register,
        (event, request: BrowserRegisterRequest) => {
            registerWebview(event, request);
        },
    );

    ipcMain.on(BrowserChannel.unregister, (_event, key: string) => {
        unregisterWebview(key);
    });

    ipcMain.on(BrowserChannel.setAudioMuted, (_event, key: string, muted: boolean) => {
        const reg = registrations.get(key);
        if (reg && !reg.webContents.isDestroyed()) {
            reg.webContents.setAudioMuted(muted);
        }
    });

    ipcMain.on(BrowserChannel.allowPopups, () => {
        globalPopupRateLimiter.allow("popups");
    });

    // Hard reload routed from the renderer (Ctrl+F5 / Ctrl+Shift+R while focus
    // is on the browser UI rather than inside the page). Arm the bypass flag
    // and reload here so the beforeunload guard is skipped without a prompt —
    // mirrors the main-side before-input-event path.
    ipcMain.on(BrowserChannel.hardReload, (_event, key: string) => {
        const reg = registrations.get(key);
        if (reg && !reg.webContents.isDestroyed()) {
            reg.bypassUnloadGuard = true;
            reg.webContents.reloadIgnoringCache();
        }
    });

    ipcMain.handle(BrowserChannel.clearProfileData, async (_event, partition: string) => {
        const ses = session.fromPartition(partition);
        await ses.clearStorageData();
        await ses.clearCache();
    });

    ipcMain.handle(BrowserChannel.clearCache, async (_event, partition: string) => {
        const ses = session.fromPartition(partition);
        await Promise.all([
            ses.clearCache(),
            ses.clearCodeCaches({}),
            ses.clearStorageData({ storages: ["serviceworkers", "cachestorage"] }),
        ]);
    });

    ipcMain.handle(BrowserChannel.collectDom, async (_event, key: string) => {
        return collectDom(key);
    });

    // CDP session management for browser automation
    initCdpHandlers((key: string) => {
        const reg = registrations.get(key);
        return reg && !reg.webContents.isDestroyed() ? reg.webContents : undefined;
    });

    // Network request logging
    initNetworkLogger();
    setWebContentsResolver((wcId: number) => {
        for (const [key, reg] of registrations) {
            if (!reg.webContents.isDestroyed() && reg.webContents.id === wcId) {
                return key;
            }
        }
        return undefined;
    });
}
