/**
 * Network request logger for browser webview sessions.
 *
 * Attaches webRequest listeners to every Electron session to capture
 * HTTP/HTTPS request and response metadata. Logs are stored per page
 * (registration key: tabId/internalTabId) and exposed to the renderer
 * via IPC. Cleared automatically when the webview is unregistered.
 */
import { app, Session, ipcMain } from "electron";
import { BrowserChannel, NetworkLogEntry } from "../ipc/browser-ipc";

const MAX_LOG_ENTRIES = 200;
const MAX_BODY_SIZE = 100 * 1024; // 100 KB — skip larger bodies

/** Per-page (registration key) circular buffer of network log entries. */
const pageLogs = new Map<string, NetworkLogEntry[]>();

/** Per-page pending request map (request id → entry reference). */
const pagePending = new Map<string, Map<number, NetworkLogEntry>>();

/** Sessions already hooked — prevent double-hooking. */
const hookedSessions = new WeakSet<Session>();

/**
 * Resolves a webContentsId to its registration key.
 * Set by browser-service.ts which owns the registrations map.
 */
let resolveWebContentsId: (wcId: number) => string | undefined = () => undefined;

/** Set the resolver function. Called once from browser-service.ts. */
export function setWebContentsResolver(
    resolver: (wcId: number) => string | undefined,
): void {
    resolveWebContentsId = resolver;
}

/** Decode request body from uploadData. Returns undefined if empty or too large. */
function decodeBody(uploadData?: Electron.UploadData[]): string | undefined {
    if (!uploadData || uploadData.length === 0) return undefined;
    try {
        const buffers = uploadData.filter(d => d.bytes).map(d => d.bytes);
        if (buffers.length === 0) return undefined;
        const totalSize = buffers.reduce((sum, b) => sum + b.length, 0);
        if (totalSize > MAX_BODY_SIZE) return undefined;
        return Buffer.concat(buffers).toString("utf-8");
    } catch {
        return undefined;
    }
}

/**
 * Attach webRequest listeners to a session for network logging.
 * Idempotent via WeakSet guard.
 */
function hookSession(ses: Session): void {
    if (hookedSessions.has(ses)) return;
    hookedSessions.add(ses);

    const filter = { urls: ["http://*/*", "https://*/*"] };

    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        // Skip OPTIONS preflight requests — not useful as resources
        if (details.method === "OPTIONS") {
            callback({ requestHeaders: details.requestHeaders });
            return;
        }

        const key = details.webContentsId != null
            ? resolveWebContentsId(details.webContentsId)
            : undefined;

        if (key) {
            if (!pageLogs.has(key)) {
                pageLogs.set(key, []);
                pagePending.set(key, new Map());
            }

            const log = pageLogs.get(key);
            const pending = pagePending.get(key);

            const entry: NetworkLogEntry = {
                id: details.id,
                url: details.url,
                method: details.method,
                resourceType: details.resourceType,
                referrer: details.referrer,
                timestamp: details.timestamp,
                requestHeaders: { ...details.requestHeaders },
                requestBody: decodeBody(details.uploadData),
            };

            // Circular buffer: remove oldest if at capacity
            if (log.length >= MAX_LOG_ENTRIES) {
                const removed = log.shift();
                pending.delete(removed.id);
            }

            pending.set(details.id, entry);
            log.push(entry);
        }

        // Pass through unchanged
        callback({ requestHeaders: details.requestHeaders });
    });

    ses.webRequest.onCompleted(filter, (details) => {
        const key = details.webContentsId != null
            ? resolveWebContentsId(details.webContentsId)
            : undefined;
        if (!key) return;

        const pending = pagePending.get(key);
        const entry = pending?.get(details.id);
        if (entry) {
            entry.statusCode = details.statusCode;
            entry.statusLine = details.statusLine;
            entry.responseHeaders = details.responseHeaders;
            entry.fromCache = details.fromCache;
            pending.delete(details.id);
        }
    });

    ses.webRequest.onErrorOccurred(filter, (details) => {
        const key = details.webContentsId != null
            ? resolveWebContentsId(details.webContentsId)
            : undefined;
        if (!key) return;

        const pending = pagePending.get(key);
        const entry = pending?.get(details.id);
        if (entry) {
            entry.error = details.error;
            pending.delete(details.id);
        }
    });
}

/** Clear the network log for a page. Called when webview is unregistered. */
export function clearNetworkLog(key: string): void {
    pageLogs.delete(key);
    pagePending.delete(key);
}

/** Initialize network logging. Call once during app startup. */
export function initNetworkLogger(): void {
    app.on("session-created", (ses: Session) => {
        hookSession(ses);
    });

    ipcMain.handle(BrowserChannel.getNetworkLog, (_event, key: string) => {
        return pageLogs.get(key) ?? [];
    });
}
