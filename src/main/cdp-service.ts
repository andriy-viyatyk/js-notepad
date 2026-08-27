/**
 * Chrome DevTools Protocol session management for browser webviews and board frames.
 *
 * Manages CDP debugger attach/detach/sendCommand via IPC. Uses Electron's
 * webContents.debugger API — no network port needed.
 *
 * Three kinds of automation target share these handlers:
 *  • Browser pages — each is its own `<webview>` `WebContents`; the debugger attaches
 *    directly to it (resolved via the browser's `getWebContents` resolver).
 *  • Boards (EPIC-037) — a board is an in-DOM `board://<host>` `<iframe>` inside the
 *    HOST window's `WebContents` (no board webContents). The debugger attaches to the
 *    host wc, and every board command is routed to the board frame via its flattened
 *    CDP session, so `Runtime.evaluate` / `Accessibility.getFullAXTree` / screenshots
 *    run in the board frame, NEVER the host's own React UI.
 *  • The app window itself — automating Persephone's OWN React UI (the `APP_WINDOW_CDP_KEY`
 *    sentinel, used by `browser_*` with `pageId: "app"`). Needs no registration: the
 *    command arrives from the target window's own renderer, so `event.sender` IS the
 *    window to drive. We attach the debugger to it and run commands on the TOP-LEVEL
 *    session (the app UI) with no frame routing.
 */
import { ipcMain, WebContents } from "electron";
import { BrowserChannel } from "../ipc/browser-ipc";
import { APP_WINDOW_CDP_KEY } from "../ipc/api-types";

/** Track which webContents have an attached debugger. */
const attachedDebuggers = new WeakSet<WebContents>();

/**
 * Board frame registrations (EPIC-037 / US-773). Kept SEPARATE from the browser's
 * registrations: a board has no webContents of its own — it is a `board://<host>`
 * frame of the host window's webContents. We store the host wc + the board's
 * `board://` host, and lazily resolve (and cache) the board frame's flattened CDP
 * session so commands target the frame, not the host app. Keyed
 * `${boardEditorId}/${BOARD_CDP_TAB}`; set/cleared via the controller.
 */
interface BoardReg {
    /** The host window's webContents (the renderer that hosts the iframe). */
    host: WebContents;
    /** The board's `board://` URL host (a stable hash of the board root). */
    boardHost: string;
    /** The iframe document's `?v=` nonce (per-mount boardId). Disambiguates THIS tab's
     *  frame from other tabs of the same board (same origin) and from the pre-reload
     *  frame after a remount — origin alone is not unique (US-796). */
    frameNonce?: string;
    /** Cached flattened session for the board frame; cleared on reload/re-register. */
    sessionId?: string;
}
const boardRegistrations = new Map<string, BoardReg>();

export function registerBoardFrame(key: string, host: WebContents, boardHost: string, frameNonce?: string): void {
    // Re-registration (e.g. a reload recreated the frame) invalidates the cached
    // session — the OOPIF target id changes, so a stale session would be dead. The new
    // `frameNonce` re-points resolution at the freshly-loaded frame.
    boardRegistrations.set(key, { host, boardHost, frameNonce });
}

export function unregisterBoardFrame(key: string, frameNonce?: string): void {
    const registration = boardRegistrations.get(key);
    if (frameNonce !== undefined && registration?.frameNonce !== frameNonce) return;
    boardRegistrations.delete(key);
}

function ensureAttached(wc: WebContents): void {
    if (attachedDebuggers.has(wc)) return;
    wc.debugger.attach("1.3");
    attachedDebuggers.add(wc);
    wc.debugger.on("detach", () => {
        attachedDebuggers.delete(wc);
    });
}

/**
 * Resolve (and cache) the flattened CDP session for a board's `board://<host>` frame.
 * Mirrors the iframe-attach the snapshot code does, but at the host-wc level: find the
 * board frame among the host's CDP targets, then `attachToTarget({ flatten: true })`.
 */
async function resolveBoardSession(reg: BoardReg): Promise<string | undefined> {
    if (reg.host.isDestroyed()) return undefined;
    ensureAttached(reg.host);
    if (reg.sessionId) return reg.sessionId;
    const origin = `board://${reg.boardHost}`;
    const { targetInfos } = await reg.host.debugger.sendCommand("Target.getTargets");
    const iframes = (targetInfos || []).filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.type === "iframe" && typeof t.url === "string" && t.url.startsWith(origin),
    );
    // Prefer the frame whose URL carries THIS registration's ?v= nonce — origin alone
    // is ambiguous when the same board is open in several tabs, or when a remount's old
    // frame briefly lingers (US-796). Fall back to the first same-origin frame only when
    // no nonce is known or none matches (e.g. an older shim without the tag).
    const target =
        (reg.frameNonce &&
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            iframes.find((t: any) => t.url.includes(`v=${reg.frameNonce}`))) ||
        iframes[0];
    if (!target) return undefined;
    const { sessionId } = await reg.host.debugger.sendCommand("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
    });
    reg.sessionId = sessionId;
    return sessionId;
}

/**
 * Send a CDP command for a board key, routed to the board frame.
 *
 * A command WITHOUT an explicit session runs in the board frame's session (resolved +
 * cached on demand). A command WITH a session (snapshot's nested-iframe attaches)
 * passes through unchanged. `Target.getTargets` short-circuits to an empty list —
 * boards are single local documents, so nested-iframe snapshots are unsupported
 * (EPIC-037 C773-2); this keeps the shared snapshot code from discovering sibling
 * frames. On a stale session (the frame reloaded) we re-resolve once.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function boardSend(reg: BoardReg, method: string, params: object | undefined, sessionId?: string): Promise<any> {
    if (reg.host.isDestroyed()) throw new Error("Board host window is gone");
    if (method === "Target.getTargets") return { targetInfos: [] };

    // `Page.captureScreenshot` can only run on a TOP-LEVEL target, not the board's
    // OOPIF session. Capture the host page on the top-level session, clipped to the
    // board iframe's on-screen rect (EPIC-037 C773-4).
    if (method === "Page.captureScreenshot") {
        ensureAttached(reg.host);
        let clip: { x: number; y: number; width: number; height: number; scale: number } | undefined;
        try {
            // Select THIS tab's iframe by its ?v= nonce (multiple tabs of the same board
            // share the board:// src prefix; only one is visible — US-796). Fall back to
            // the origin-prefix selector when no nonce is known.
            const selector = reg.frameNonce
                ? `iframe[src*="v=${reg.frameNonce}"]`
                : `iframe[src^="board://${reg.boardHost}"]`;
            const rect = await reg.host.debugger.sendCommand("Runtime.evaluate", {
                expression:
                    `(() => { const f = document.querySelector('${selector}');` +
                    ` if (!f) return ""; const r = f.getBoundingClientRect();` +
                    ` return JSON.stringify({ x: r.x, y: r.y, width: r.width, height: r.height }); })()`,
                returnByValue: true,
            });
            const json = rect?.result?.value;
            if (json) {
                const r = JSON.parse(json);
                if (r.width > 0 && r.height > 0) {
                    clip = { x: r.x, y: r.y, width: r.width, height: r.height, scale: 1 };
                }
            }
        } catch {
            // Couldn't resolve the rect — fall back to capturing the whole host page.
        }
        return reg.host.debugger.sendCommand("Page.captureScreenshot", {
            ...(params || {}),
            ...(clip ? { clip } : {}),
        });
    }

    if (sessionId) {
        return reg.host.debugger.sendCommand(method, params, sessionId);
    }

    let sid = await resolveBoardSession(reg);
    if (!sid) throw new Error("Board frame not ready for CDP (still loading?)");
    try {
        return await reg.host.debugger.sendCommand(method, params, sid);
    } catch (e) {
        // The cached session may be stale (frame reloaded/navigated) — re-resolve once.
        reg.sessionId = undefined;
        sid = await resolveBoardSession(reg);
        if (sid) return reg.host.debugger.sendCommand(method, params, sid);
        throw e;
    }
}

/**
 * Initialize CDP IPC handlers.
 * @param getWebContents — resolver from registration key to webContents (browser pages)
 */
export function initCdpHandlers(
    getWebContents: (key: string) => WebContents | undefined,
): void {
    ipcMain.handle(BrowserChannel.cdpAttach, async (event, key: string) => {
        if (key === APP_WINDOW_CDP_KEY) {
            if (event.sender.isDestroyed()) return false;
            try {
                ensureAttached(event.sender);
                return true;
            } catch {
                return false;
            }
        }
        const board = boardRegistrations.get(key);
        if (board) {
            if (board.host.isDestroyed()) return false;
            try {
                ensureAttached(board.host);
                return true;
            } catch {
                return false;
            }
        }
        const wc = getWebContents(key);
        if (!wc || wc.isDestroyed()) return false;
        if (attachedDebuggers.has(wc)) return true;
        try {
            ensureAttached(wc);
            return true;
        } catch {
            return false;
        }
    });

    ipcMain.handle(BrowserChannel.cdpDetach, async (_event, key: string) => {
        if (key === APP_WINDOW_CDP_KEY) {
            // The app window's debugger is SHARED (boards attach to the same wc);
            // never detach it — just leave it attached for the window's lifetime.
            return;
        }
        const board = boardRegistrations.get(key);
        if (board) {
            // The host wc debugger is SHARED (other boards / future use); never detach
            // it for one board — just drop this board's cached frame session.
            board.sessionId = undefined;
            return;
        }
        const wc = getWebContents(key);
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
        async (event, key: string, method: string, params?: object, sessionId?: string) => {
            if (key === APP_WINDOW_CDP_KEY) {
                const wc = event.sender;
                if (wc.isDestroyed()) throw new Error("App window is gone");
                if (!attachedDebuggers.has(wc)) {
                    try {
                        ensureAttached(wc);
                    } catch {
                        throw new Error("Failed to attach CDP debugger");
                    }
                }
                // Top-level session — Persephone's own React UI. `sessionId` is passed
                // through so the shared snapshot code's nested-iframe attaches (board
                // frames inside the app) and their `f1-…` refs still resolve.
                return wc.debugger.sendCommand(method, params, sessionId);
            }
            const board = boardRegistrations.get(key);
            if (board) {
                return boardSend(board, method, params, sessionId);
            }
            const wc = getWebContents(key);
            if (!wc || wc.isDestroyed()) {
                throw new Error("WebContents not found or destroyed");
            }
            // Auto-attach on first command
            if (!attachedDebuggers.has(wc)) {
                try {
                    ensureAttached(wc);
                } catch {
                    throw new Error("Failed to attach CDP debugger");
                }
            }
            return wc.debugger.sendCommand(method, params, sessionId);
        },
    );
}
