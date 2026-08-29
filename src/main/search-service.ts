/**
 * Main process file content search service.
 *
 * This module is only the host: it owns the worker lifecycle and relays messages between the
 * renderer and a `search-worker` thread that does the actual walking. The walk itself lives in
 * `search-worker.ts` precisely so it never runs here — synchronous fs I/O on the main-process
 * event loop freezes the window message pump and makes cancellation unreachable.
 *
 * One worker per sender (window). Cancelling — whether from the panel, a changed query, a new
 * search, or the window closing — is `worker.terminate()`, which stops the walk immediately
 * instead of waiting for a flag the blocked worker would never read.
 */
import fs from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { app, ipcMain, WebContents } from "electron";
import {
    SearchChannel,
    SearchRequest,
    SearchCancel,
    SearchResultBatch,
    SearchProgress,
    SearchComplete,
    SearchError,
} from "../ipc/search-ipc";
import type { SearchWorkerMessage } from "./search-worker";

/** Active search per sender (webContents id → its worker). */
const activeSearches = new Map<number, { worker: Worker; searchId: string }>();

/** Senders that already have a "destroyed" listener, so we don't stack them. */
const watchedSenders = new WeakSet<WebContents>();

/**
 * The worker's bundled source (`search-worker.js`, built beside `main.js`).
 *
 * Loaded as SOURCE and run with `{ eval: true }` rather than handed to `new Worker(path)`:
 * the packaged app is an asar archive, and a worker thread bootstraps its own Node environment
 * whose module loader cannot be relied on to resolve an entry inside it. `fs.readFileSync` is
 * asar-aware in the main process, so reading the file here always works — the same approach
 * `board-protocol-service.ts` uses for the board shim.
 *
 * Cached for the process lifetime in a packaged build (the file cannot change under us). In DEV
 * the cache is skipped, because the dev server rebuilds the worker on every edit WITHOUT
 * restarting Electron.
 */
let workerSource: string | null = null;
function getWorkerSource(): string {
    if (workerSource === null || !app.isPackaged) {
        try {
            workerSource = fs.readFileSync(path.join(__dirname, "search-worker.js"), "utf8");
        } catch (e) {
            console.error("search: failed to load search-worker.js:", e);
            workerSource = "";
        }
    }
    return workerSource;
}

/** Stop and forget the sender's search, if any. */
function terminateSearch(senderId: number): void {
    const active = activeSearches.get(senderId);
    if (!active) return;
    activeSearches.delete(senderId);
    active.worker.terminate();
}

function send(sender: WebContents, channel: string, payload: unknown): void {
    try {
        if (!sender.isDestroyed()) {
            sender.send(channel, payload);
        }
    } catch {
        // Sender may have been destroyed between the check and the send
    }
}

/**
 * Initialize search IPC handlers. Call once during app startup.
 */
export function initSearchHandlers(): void {
    ipcMain.on(SearchChannel.start, (event, request: SearchRequest) => {
        const sender = event.sender;
        const senderId = sender.id;
        const { searchId } = request;

        // Only one search per window — replace whatever was running.
        terminateSearch(senderId);

        // A window that goes away mid-search must not leave its worker walking.
        if (!watchedSenders.has(sender)) {
            watchedSenders.add(sender);
            sender.once("destroyed", () => terminateSearch(senderId));
        }

        const source = getWorkerSource();
        if (!source) {
            const error: SearchError = { searchId, message: "Search worker unavailable" };
            send(sender, SearchChannel.error, error);
            return;
        }

        const worker = new Worker(source, { eval: true });
        activeSearches.set(senderId, { worker, searchId });

        // Ignore anything from a worker that has already been replaced or cancelled.
        const isCurrent = () => activeSearches.get(senderId)?.worker === worker;

        const finish = () => {
            if (isCurrent()) activeSearches.delete(senderId);
            worker.terminate();
        };

        worker.on("message", (msg: SearchWorkerMessage) => {
            if (!isCurrent()) return;

            switch (msg.type) {
                case "batch": {
                    const batch: SearchResultBatch = {
                        searchId,
                        files: msg.files,
                        filesSearched: msg.filesSearched,
                    };
                    send(sender, SearchChannel.result, batch);
                    break;
                }
                case "progress": {
                    const progress: SearchProgress = { searchId, filesSearched: msg.filesSearched };
                    send(sender, SearchChannel.progress, progress);
                    break;
                }
                case "complete": {
                    const complete: SearchComplete = {
                        searchId,
                        totalMatches: msg.totalMatches,
                        totalFiles: msg.totalFiles,
                        filesSearched: msg.filesSearched,
                        truncated: msg.truncated,
                    };
                    finish();
                    send(sender, SearchChannel.complete, complete);
                    break;
                }
                case "error": {
                    const error: SearchError = { searchId, message: msg.message };
                    finish();
                    send(sender, SearchChannel.error, error);
                    break;
                }
            }
        });

        worker.on("error", (err: Error) => {
            if (!isCurrent()) return;
            finish();
            send(sender, SearchChannel.error, {
                searchId,
                message: err.message || "Search failed",
            } satisfies SearchError);
        });

        worker.postMessage({ type: "search", request });
    });

    // Scoped by search id, not by sender: a window runs one search at a time, but a view that
    // was disposed after its search was replaced would otherwise terminate the *replacement*.
    // A stale or unknown id is a silent no-op — it only means that search already ended.
    // Optional-chained because a malformed message must not throw in the main process.
    ipcMain.on(SearchChannel.cancel, (event, cancel: SearchCancel | undefined) => {
        const active = activeSearches.get(event.sender.id);
        if (cancel?.searchId && active?.searchId === cancel.searchId) {
            terminateSearch(event.sender.id);
        }
    });
}
