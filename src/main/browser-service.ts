/**
 * Main process browser service.
 *
 * Manages webContents for browser tab webviews. When a renderer registers
 * a webview by its webContentsId, this service attaches event listeners
 * on the actual webContents and relays events back to the renderer via IPC.
 * This provides reliable events (e.g. page-favicon-updated fires consistently)
 * compared to the <webview> DOM element's event API.
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
    webContents: WebContents;
    senderWebContents: WebContents;
    listeners: Array<{ event: string; handler: (...args: any[]) => void }>;
}

// Active registrations: tabId → registration
const registrations = new Map<string, RegisteredWebview>();

function sendEvent(
    sender: WebContents,
    tabId: string,
    type: BrowserEvent["type"],
    data: BrowserEvent["data"],
) {
    try {
        if (!sender.isDestroyed()) {
            const event: BrowserEvent = { tabId, type, data };
            sender.send(BrowserChannel.event, event);
        }
    } catch {
        // Sender may have been destroyed
    }
}

function registerWebview(event: IpcMainEvent, request: BrowserRegisterRequest) {
    const { tabId, webContentsId } = request;

    // Clean up any previous registration for this tabId
    unregisterWebview(tabId);

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
        sendEvent(sender, tabId, "did-navigate", {
            url,
            canGoBack: wc.canGoBack(),
            canGoForward: wc.canGoForward(),
        });
    });

    on("did-navigate-in-page", (_e: any, url: string, isMainFrame: boolean) => {
        if (isMainFrame) {
            sendEvent(sender, tabId, "did-navigate-in-page", {
                url,
                canGoBack: wc.canGoBack(),
                canGoForward: wc.canGoForward(),
                isMainFrame,
            });
        }
    });

    on("page-title-updated", (_e: any, title: string) => {
        sendEvent(sender, tabId, "page-title-updated", { title });
    });

    on("page-favicon-updated", (_e: any, favicons: string[]) => {
        if (favicons && favicons.length > 0) {
            sendEvent(sender, tabId, "page-favicon-updated", {
                favicon: favicons[0],
            });
        }
    });

    on("did-start-loading", () => {
        sendEvent(sender, tabId, "did-start-loading", {});
    });

    on("did-stop-loading", () => {
        sendEvent(sender, tabId, "did-stop-loading", {});
    });

    on("did-start-navigation", (_e: any, url: string) => {
        // Block navigation to dangerous protocols
        try {
            const parsed = new URL(url);
            if (BLOCKED_PROTOCOLS.includes(parsed.protocol)) {
                wc.stop();
                sendEvent(sender, tabId, "did-start-navigation", {
                    url,
                    blocked: true,
                });
            }
        } catch {
            // Invalid URL
        }
    });

    // Clean up if the webview's webContents is destroyed
    wc.once("destroyed", () => {
        registrations.delete(tabId);
    });

    // Clean up if the sender (renderer window) is destroyed
    sender.once("destroyed", () => {
        unregisterWebview(tabId);
    });

    registrations.set(tabId, {
        tabId,
        webContents: wc,
        senderWebContents: sender,
        listeners,
    });
}

function unregisterWebview(tabId: string) {
    const reg = registrations.get(tabId);
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

    registrations.delete(tabId);
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

    ipcMain.on(BrowserChannel.unregister, (_event, tabId: string) => {
        unregisterWebview(tabId);
    });
}
