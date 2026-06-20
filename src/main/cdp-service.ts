/**
 * Chrome DevTools Protocol session management for browser webviews.
 *
 * Manages CDP debugger attach/detach/sendCommand per webview via IPC.
 * Uses Electron's webContents.debugger API — no network port needed.
 */
import { ipcMain, WebContents } from "electron";
import { BrowserChannel } from "../ipc/browser-ipc";

/** Track which webContents have an attached debugger. */
const attachedDebuggers = new WeakSet<WebContents>();

/**
 * Board webviews registered for CDP automation (EPIC-034 / US-730). Kept SEPARATE
 * from the browser's registrations because the browser's registerWebview attaches
 * browser-only listeners (will-navigate / will-prevent-unload / hotkeys / popup
 * guard) that would misfire on a board — a board needs only the key→webContents
 * mapping. Keyed `${boardEditorId}/${BOARD_CDP_TAB}`; set/cleared via the controller.
 */
const boardRegistrations = new Map<string, WebContents>();

export function registerBoardWebContents(key: string, wc: WebContents): void {
    boardRegistrations.set(key, wc);
}

export function unregisterBoardWebContents(key: string): void {
    boardRegistrations.delete(key);
}

/**
 * Initialize CDP IPC handlers.
 * @param getWebContents — resolver from registration key to webContents (browser pages)
 */
export function initCdpHandlers(
    getWebContents: (key: string) => WebContents | undefined,
): void {
    // Board registrations take precedence; fall back to the browser resolver.
    const resolve = (key: string): WebContents | undefined => {
        const board = boardRegistrations.get(key);
        if (board) return board.isDestroyed() ? undefined : board;
        return getWebContents(key);
    };

    ipcMain.handle(BrowserChannel.cdpAttach, async (_event, key: string) => {
        const wc = resolve(key);
        if (!wc || wc.isDestroyed()) return false;
        if (attachedDebuggers.has(wc)) return true;
        try {
            wc.debugger.attach("1.3");
            attachedDebuggers.add(wc);
            wc.debugger.on("detach", () => {
                attachedDebuggers.delete(wc);
            });
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle(BrowserChannel.cdpDetach, async (_event, key: string) => {
        const wc = resolve(key);
        if (!wc || wc.isDestroyed()) return;
        if (!attachedDebuggers.has(wc)) return;
        try {
            wc.debugger.detach();
        } catch {
            // already detached
        }
        attachedDebuggers.delete(wc);
    });

    ipcMain.handle(
        BrowserChannel.cdpSend,
        async (_event, key: string, method: string, params?: object, sessionId?: string) => {
            const wc = resolve(key);
            if (!wc || wc.isDestroyed()) {
                throw new Error("WebContents not found or destroyed");
            }
            // Auto-attach on first command
            if (!attachedDebuggers.has(wc)) {
                try {
                    wc.debugger.attach("1.3");
                    attachedDebuggers.add(wc);
                    wc.debugger.on("detach", () => {
                        attachedDebuggers.delete(wc);
                    });
                } catch {
                    throw new Error("Failed to attach CDP debugger");
                }
            }
            return wc.debugger.sendCommand(method, params, sessionId);
        },
    );
}
