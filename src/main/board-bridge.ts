/**
 * Per-board bridge (EPIC-034 / US-724; re-homed onto a `MessagePort` in
 * EPIC-037 / US-771).
 *
 * A board iframe has no `ipcRenderer` and no preload. Its only channel to the
 * privileged side is a `MessageChannelMain` port minted **per board** in main:
 * `createBoardPort` keeps `port2` here, wired to the RPC handler, and ships
 * `port1` to the host renderer (`hostWebContents.postMessage(eBoardPort, …,
 * [port1])`), which transfers it into the board frame (the one-time handshake).
 * Thereafter the board ↔ main talk directly over the duplex port.
 *
 * The bridge serves the in-app effects `execute()` cannot express:
 *  • `execute()` (streaming) rides `{ kind:"runner", … }` envelopes → the shared
 *    command runner (`command-runner.ts`), defaulting the cwd to the board folder;
 *  • request/reply: the native dialogs + `readFile`/`writeFile`;
 *  • fire-and-forget: `openRawLink`, `notify`;
 *  • main → board: live theme retint (`pushThemeToBoards`).
 *
 * The board root + owner window are resolved from the per-board registry (keyed by
 * the boardId minted at the handshake), NOT from `event.sender.session` — with one
 * shared host session that can't disambiguate boards (the old model, US-770).
 */
import fs from "node:fs";
import path from "node:path";
import {
    BrowserWindow,
    MessageChannelMain,
    MessagePortMain,
    WebContents,
} from "electron";
import {
    BoardFileEncoding,
    BoardNotifyType,
    BoardThemePalette,
    BoardToMain,
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
} from "../ipc/board-bridge-channels";
import { RunnerChannel, RunnerKillMsg, RunnerStartMsg, RunnerStdinMsg } from "../ipc/runner-channels";
import { EventEndpoint } from "../ipc/api-types";
import {
    showOpenFileDialog,
    showOpenFolderDialog,
    showSaveFileDialog,
} from "../ipc/main/dialog-handlers";
import { getBoardRootForHost } from "./board-protocol-service";
import {
    endJobStdin,
    JobSink,
    killJob,
    reapJobsBySinkId,
    startJobTo,
    writeJobStdin,
} from "./command-runner";

interface BoardPortEntry {
    /** Main's end of the per-board channel. */
    port: MessagePortMain;
    /** Absolute board root — default `execute()` cwd + relative-path base. */
    root: string;
    /** The board's `board://` host. */
    host: string;
    /** The host renderer window — owner for dialogs/links/notify/log. */
    hostWebContents: WebContents;
    /** Set when the shim's "connected" message arrives (mode D, EPIC-037 C11). */
    connected?: boolean;
    /** Mode-D handshake watchdog; cleared on connect / dispose. */
    watchdog?: ReturnType<typeof setTimeout>;
}

/** Live board ports keyed by the per-mount boardId minted at the handshake. */
const boardPorts = new Map<string, BoardPortEntry>();

/** Host webContents we've wired load-failure + crash/destroy reaping on (once each). */
const wiredHosts = new Set<number>();

/** Mode-D (C11) handshake watchdog window: a healthy board connects in tens of ms; this
 *  is generous against a slow first paint while still catching a dead bridge. */
const BOARD_HANDSHAKE_TIMEOUT_MS = 5000;

/**
 * The BrowserWindow that owns a board's host renderer. With the iframe model the
 * requester is a real window (not a `<webview>` guest), so `fromWebContents` is
 * reliable; keep the focused/any fallbacks defensively.
 */
function ownerWindow(hostWebContents: WebContents): BrowserWindow | undefined {
    return (
        BrowserWindow.fromWebContents(hostWebContents) ??
        BrowserWindow.getFocusedWindow() ??
        BrowserWindow.getAllWindows()[0] ??
        undefined
    );
}

/** A runner sink that streams a board's job output over its port. */
function portSink(entry: BoardPortEntry, boardId: string): JobSink {
    return {
        id: boardId,
        send(channel: RunnerChannel, payload: unknown) {
            try {
                entry.port.postMessage({ kind: "runner", channel, msg: payload });
            } catch {
                // port closed — ignore
            }
        },
    };
}

/** Resolve a board file-bridge path (US-756 C4): absolute as-is, else relative to
 *  the board root. NOT sandboxed — a trusted board can already touch any file via
 *  `execute()`; this only removes the "shell a script to read a file" overhead. */
function resolveBoardFilePath(root: string, p: string | undefined): string {
    if (!p || typeof p !== "string") throw new Error("A file path is required");
    if (path.isAbsolute(p)) return p;
    return path.resolve(root, p);
}

/** Run a request/reply RPC and return its result (thrown errors reject the caller). */
async function runRpc(
    entry: BoardPortEntry,
    method: string,
    args: unknown[],
): Promise<unknown> {
    const win = ownerWindow(entry.hostWebContents);
    switch (method) {
        case "openFileDialog":
            return showOpenFileDialog(win, (args[0] as OpenFileDialogParams) ?? {});
        case "saveFileDialog":
            return showSaveFileDialog(win, (args[0] as SaveFileDialogParams) ?? {});
        case "openFolderDialog":
            return showOpenFolderDialog(win, (args[0] as OpenFolderDialogParams) ?? {});
        case "readFile": {
            const filePath = resolveBoardFilePath(entry.root, args[0] as string);
            const encoding: BufferEncoding = (args[1] as BoardFileEncoding) === "base64" ? "base64" : "utf8";
            const buf = await fs.promises.readFile(filePath);
            return buf.toString(encoding);
        }
        case "writeFile": {
            const filePath = resolveBoardFilePath(entry.root, args[0] as string);
            const encoding: BufferEncoding = (args[2] as BoardFileEncoding) === "base64" ? "base64" : "utf8";
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            await fs.promises.writeFile(filePath, Buffer.from((args[1] as string) ?? "", encoding));
            return undefined;
        }
        default:
            throw new Error(`Unknown board RPC method: ${method}`);
    }
}

/** Fire-and-forget effects (no reply). */
function runFire(entry: BoardPortEntry, method: string, args: unknown[]): void {
    const win = ownerWindow(entry.hostWebContents);
    if (method === "openRawLink") {
        const href = args[0] as string;
        if (!href) return;
        win?.webContents.send(EventEndpoint.eBoardOpenRawLink, { href, editor: args[1] as string | undefined });
        win?.focus();
        return;
    }
    if (method === "notify") {
        const message = args[0] as string;
        if (!message) return;
        const type = args[1] as BoardNotifyType | undefined;
        win?.webContents.send(EventEndpoint.eBoardNotify, { message, type });
        // Mirror errors/warnings to the board's ui.log (US-726) for author/agent review.
        if (type === "error" || type === "warning") {
            try {
                fs.appendFileSync(
                    path.join(entry.root, "ui.log"),
                    `[${new Date().toISOString()}] [${type}] ${message}\n`,
                );
            } catch {
                // Logging must never throw into the bridge.
            }
        }
    }
}

/** Dispatch a board → main port message. */
function handleBoardMessage(boardId: string, data: BoardToMain): void {
    const entry = boardPorts.get(boardId);
    if (!entry || !data) return;

    if (data.kind === "connected") {
        // Mode D (C11): the shim is live — cancel the handshake watchdog.
        entry.connected = true;
        if (entry.watchdog) {
            clearTimeout(entry.watchdog);
            entry.watchdog = undefined;
        }
        return;
    }

    if (data.kind === "runner") {
        switch (data.channel) {
            case RunnerChannel.start: {
                const msg = data.msg as RunnerStartMsg;
                // Default cwd = board folder; an explicit opts.cwd overrides.
                const opts = { ...(entry.root ? { cwd: entry.root } : {}), ...msg.opts };
                startJobTo(portSink(entry, boardId), { ...msg, opts });
                return;
            }
            case RunnerChannel.stdin: {
                const msg = data.msg as RunnerStdinMsg;
                writeJobStdin(msg.jobId, msg.data);
                return;
            }
            case RunnerChannel.endStdin:
                endJobStdin((data.msg as { jobId: string }).jobId);
                return;
            case RunnerChannel.kill: {
                const msg = data.msg as RunnerKillMsg;
                killJob(msg.jobId, msg.signal);
                return;
            }
        }
        return;
    }

    if (data.kind === "fire") {
        runFire(entry, data.method, data.args);
        return;
    }

    if (data.kind === "rpc") {
        const { id, method, args } = data;
        void runRpc(entry, method, args)
            .then((result) => entry.port.postMessage({ kind: "rpc-result", id, result }))
            .catch((e: unknown) =>
                entry.port.postMessage({
                    kind: "rpc-result",
                    id,
                    error: e instanceof Error ? e.message : String(e),
                }),
            );
    }
}

/** Reap every board hosted by a host webContents that crashed/was destroyed. */
function reapHost(hostWebContentsId: number): void {
    for (const [boardId, entry] of [...boardPorts]) {
        if (entry.hostWebContents.id === hostWebContentsId) disposeBoardPort(boardId);
    }
    wiredHosts.delete(hostWebContentsId);
}

/** Append a board load failure to its `ui.log` and toast the host renderer — the shared
 *  funnel for modes A and D (EPIC-037 C11). Never throws into the caller. */
function reportBoardLoadFailure(hostWebContents: WebContents, root: string, detail: string): void {
    if (root) {
        try {
            fs.appendFileSync(path.join(root, "ui.log"), `[${new Date().toISOString()}] [error] ${detail}\n`);
        } catch {
            // Logging must never throw into the bridge.
        }
    }
    try {
        hostWebContents.send(EventEndpoint.eBoardNotify, {
            message: `Board failed to load: ${detail}`,
            type: "error",
        });
    } catch {
        // Window gone — nothing to toast.
    }
}

/**
 * Wire a host renderer once: mode-A board load-failure reporting + crash reaping of its
 * orphaned board ports (EPIC-037 C11). Idempotent (guarded by `wiredHosts`). Called at
 * board MOUNT (`registerBoard` via the controller — so it catches a main-doc failure that
 * never fires the iframe `load`) and again from `createBoardPort`.
 */
export function ensureHostWired(hostWebContents: WebContents): void {
    if (wiredHosts.has(hostWebContents.id)) return;
    wiredHosts.add(hostWebContents.id);

    // Mode A: Electron fires `did-fail-load` on the PARENT wc for sub-frame failures
    // (isMainFrame=false). The board:// frame is the only sub-frame; filter to it and
    // resolve its root from the mount-time registry (`getBoardRootForHost`).
    hostWebContents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (isMainFrame) return; // host's own navigation, not a board
        if (errorCode === -3) return; // ERR_ABORTED — superseded navigation (e.g. soft reload)
        if (!validatedURL || !validatedURL.startsWith("board://")) return;
        let host: string;
        try {
            host = new URL(validatedURL).host;
        } catch {
            return;
        }
        const root = getBoardRootForHost(host);
        if (!root) return;
        reportBoardLoadFailure(hostWebContents, root, `${errorCode} ${errorDescription} ${validatedURL}`);
    });

    // Backstop: dispose this host's board ports + jobs if the renderer dies.
    hostWebContents.once("destroyed", () => reapHost(hostWebContents.id));
    hostWebContents.on("render-process-gone", () => reapHost(hostWebContents.id));
}

/** Mint a per-board port pair, wire port2 to the RPC handler, deliver port1 to the
 *  requesting host renderer. Called from the `requestBoardPort` endpoint on every
 *  iframe `load` (US-771 C771-6); a re-request for a live boardId disposes the old. */
export function createBoardPort(hostWebContents: WebContents, boardId: string, host: string): void {
    // Re-handshake (reload / navigation): drop the superseded port first.
    if (boardPorts.has(boardId)) disposeBoardPort(boardId);

    const root = getBoardRootForHost(host) ?? "";
    const { port1, port2 } = new MessageChannelMain();
    const entry: BoardPortEntry = { port: port2, root, host, hostWebContents };
    boardPorts.set(boardId, entry);

    port2.on("message", (e) => handleBoardMessage(boardId, e.data as BoardToMain));
    port2.start();

    ensureHostWired(hostWebContents);

    // Mode D (C11): the shim posts `{ kind: "connected" }` as soon as it attaches the port.
    // If it never arrives, the board painted but its bridge is dead — report it.
    if (root) {
        entry.watchdog = setTimeout(() => {
            if (!entry.connected) {
                reportBoardLoadFailure(
                    hostWebContents,
                    root,
                    "board bridge did not connect (the board loaded but its script bridge never initialized)",
                );
            }
        }, BOARD_HANDSHAKE_TIMEOUT_MS);
    }

    hostWebContents.postMessage(EventEndpoint.eBoardPort, { boardId }, [port1]);
}

/** Tear down a board's port and tree-kill its jobs (unmount / reload / host crash). */
export function disposeBoardPort(boardId: string): void {
    const entry = boardPorts.get(boardId);
    if (!entry) return;
    if (entry.watchdog) {
        clearTimeout(entry.watchdog);
        entry.watchdog = undefined;
    }
    try { entry.port.close(); } catch { /* already closed */ }
    reapJobsBySinkId(boardId);
    boardPorts.delete(boardId);
}

/** Live retint: push a new palette to every running board (US-771). */
export function pushThemeToBoards(palette: BoardThemePalette): void {
    for (const entry of boardPorts.values()) {
        try {
            entry.port.postMessage({ kind: "theme", palette });
        } catch {
            // port closed — ignore
        }
    }
}

/** Dispose all board ports + jobs. Wired into `app.on("will-quit", …)`. */
export function disposeAllBoardPorts(): void {
    for (const boardId of [...boardPorts.keys()]) disposeBoardPort(boardId);
    wiredHosts.clear();
}
