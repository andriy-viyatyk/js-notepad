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
 * internal browser tabs per js-notepad page tab.
 */
import { ipcMain, IpcMainEvent, webContents, WebContents } from "electron";
import {
    BrowserChannel,
    BrowserRegisterRequest,
    BrowserEvent,
} from "../ipc/browser-ipc";

const BLOCKED_PROTOCOLS = ["file:", "app-asset:", "safe-file:"];

interface RegisteredWebview {
    tabId: string;
    internalTabId: string;
    webContents: WebContents;
    senderWebContents: WebContents;
    listeners: Array<{ event: string; handler: (...args: any[]) => void }>;
}

// Active registrations: `${tabId}/${internalTabId}` → registration
const registrations = new Map<string, RegisteredWebview>();

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

function registerWebview(event: IpcMainEvent, request: BrowserRegisterRequest) {
    const { tabId, internalTabId, webContentsId } = request;
    const key = regKey(tabId, internalTabId);

    // Clean up any previous registration for this key
    unregisterWebview(key);

    const wc = webContents.fromId(webContentsId);
    if (!wc) return;

    const sender = event.sender;
    const listeners: RegisteredWebview["listeners"] = [];

    function on<T extends string>(
        eventName: T,
        handler: (...args: any[]) => void,
    ) {
        wc.on(eventName as any, handler);
        listeners.push({ event: eventName, handler });
    }

    on("did-navigate", (_e: any, url: string) => {
        sendEvent(sender, tabId, internalTabId, "did-navigate", {
            url,
            canGoBack: wc.canGoBack(),
            canGoForward: wc.canGoForward(),
        });
    });

    on("did-navigate-in-page", (_e: any, url: string, isMainFrame: boolean) => {
        if (isMainFrame) {
            sendEvent(sender, tabId, internalTabId, "did-navigate-in-page", {
                url,
                canGoBack: wc.canGoBack(),
                canGoForward: wc.canGoForward(),
                isMainFrame,
            });
        }
    });

    on("page-title-updated", (_e: any, title: string) => {
        sendEvent(sender, tabId, internalTabId, "page-title-updated", {
            title,
        });
    });

    on("page-favicon-updated", (_e: any, favicons: string[]) => {
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
        sendEvent(sender, tabId, internalTabId, "did-stop-loading", {});
    });

    on("did-start-navigation", (_e: any, url: string) => {
        // Block navigation to dangerous protocols
        try {
            const parsed = new URL(url);
            if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
                wc.stop();
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

    // Intercept window.open / target="_blank" — deny the popup and relay URL
    wc.setWindowOpenHandler(({ url, disposition }) => {
        sendEvent(sender, tabId, internalTabId, "new-window", {
            url,
            disposition,
        });
        return { action: "deny" };
    });

    // Clean up if the webview's webContents is destroyed
    wc.once("destroyed", () => {
        registrations.delete(key);
    });

    // Clean up if the sender (renderer window) is destroyed
    sender.once("destroyed", () => {
        unregisterWebview(key);
    });

    registrations.set(key, {
        tabId,
        internalTabId,
        webContents: wc,
        senderWebContents: sender,
        listeners,
    });
}

function unregisterWebview(key: string) {
    const reg = registrations.get(key);
    if (!reg) return;

    // Remove all event listeners
    for (const { event: eventName, handler } of reg.listeners) {
        try {
            if (!reg.webContents.isDestroyed()) {
                (reg.webContents as any).removeListener(eventName, handler);
            }
        } catch {
            // webContents may already be destroyed
        }
    }

    registrations.delete(key);
}

/**
 * Initialize browser IPC handlers. Call once during app startup.
 */
export function initBrowserHandlers(): void {
    ipcMain.on(
        BrowserChannel.register,
        (event, request: BrowserRegisterRequest) => {
            registerWebview(event, request);
        },
    );

    ipcMain.on(BrowserChannel.unregister, (_event, key: string) => {
        unregisterWebview(key);
    });
}
