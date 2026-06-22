/**
 * Board integration-tier IPC (EPIC-034 / US-724).
 *
 * The board page's `persephone` bridge (`src/preload-board.ts`) talks to main
 * over these channels for the in-app effects `execute()` cannot express:
 * resolving the board's root folder (for the default `execute()` `cwd`), opening
 * a link, showing a toast, and the native file dialogs. `execute()` itself rides
 * the separate command-runner channels (`command-runner.ts`); this module keeps
 * the runner board-agnostic.
 *
 * Every handler resolves two things from the caller:
 *  • the board root, via `getBoardRootForSession(event.sender.session)` — the
 *    board webview's session IS the one its `board://` handler was registered on;
 *  • the embedder window, via `ownerWindow(event)` — to push renderer events to
 *    the right window and to parent native dialogs.
 */
import fs from "node:fs";
import path from "node:path";
import {
    BrowserWindow,
    IpcMainEvent,
    IpcMainInvokeEvent,
    ipcMain,
} from "electron";
import {
    BoardBridgeChannel,
    BoardContext,
    BoardNotifyMsg,
    BoardOpenRawLinkMsg,
    BoardReadFileMsg,
    BoardThemePalette,
    BoardWriteFileMsg,
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
} from "../ipc/board-bridge-channels";
import { EventEndpoint } from "../ipc/api-types";
import {
    showOpenFileDialog,
    showOpenFolderDialog,
    showSaveFileDialog,
} from "../ipc/main/dialog-handlers";
import { getBoardDesignForSession, getBoardRootForSession } from "./board-protocol-service";

/** Fallback palette for an unknown session (mirrors the `boardRoot ?? ""` pattern). */
const EMPTY_THEME: BoardThemePalette = { id: "", isDark: true, vars: {} };

/**
 * The BrowserWindow hosting the calling board webview. `BrowserWindow.from-
 * WebContents` may return null for a `<webview>` guest, so fall back to the
 * focused window (the board is interactive there) and finally any window.
 */
function ownerWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | undefined {
    return (
        BrowserWindow.fromWebContents(event.sender) ??
        BrowserWindow.getFocusedWindow() ??
        BrowserWindow.getAllWindows()[0] ??
        undefined
    );
}

/**
 * Resolve a board file-bridge path (US-756 C4). An absolute path is used as-is; a
 * relative path resolves against the caller's board root (the same default cwd as
 * `execute()`). Throws if no path is given, or if a relative path is used from a
 * session whose board root can't be resolved. NOT sandboxed to the board folder —
 * a trusted board can already read/write anywhere via `execute()`, so this only
 * removes the "shell a script to touch a file" overhead.
 */
function resolveBoardFilePath(event: IpcMainInvokeEvent, p: string | undefined): string {
    if (!p || typeof p !== "string") {
        throw new Error("A file path is required");
    }
    if (path.isAbsolute(p)) return p;
    const root = getBoardRootForSession(event.sender.session);
    if (!root) {
        throw new Error(`Cannot resolve relative path "${p}": the board root is unknown`);
    }
    return path.resolve(root, p);
}

/** Register the board integration-tier IPC handlers. Call once at startup. */
export function initBoardBridge(): void {
    // Synchronous board-context lookup — the preload calls this once at init
    // (before the page runs) to learn its board root for the default cwd.
    ipcMain.on(BoardBridgeChannel.getContext, (event: IpcMainEvent) => {
        const boardRoot = getBoardRootForSession(event.sender.session) ?? "";
        const design = getBoardDesignForSession(event.sender.session);
        event.returnValue = {
            boardRoot,
            theme: design?.theme ?? EMPTY_THEME,
            tokens: design?.tokens ?? {},
        } satisfies BoardContext;
    });

    // openRawLink → forward to the host renderer's link pipeline (href-agnostic:
    // file or URL). Carries an optional editor target (US-756 C6) so a board can
    // request e.g. "md-view" for a Markdown doc.
    ipcMain.on(BoardBridgeChannel.openRawLink, (event: IpcMainEvent, msg: BoardOpenRawLinkMsg) => {
        const href = msg?.href;
        if (!href) return;
        const win = ownerWindow(event);
        win?.webContents.send(EventEndpoint.eBoardOpenRawLink, { href, editor: msg.editor });
        win?.focus();
    });

    // notify → push a toast to the host renderer (eBoardNotify → ui.notify), and
    // append errors/warnings to the board's ui.log (US-726) so an author/agent can
    // review failures. The board root is resolved from the caller's session.
    ipcMain.on(BoardBridgeChannel.notify, (event: IpcMainEvent, msg: BoardNotifyMsg) => {
        if (!msg?.message) return;
        ownerWindow(event)?.webContents.send(EventEndpoint.eBoardNotify, {
            message: msg.message,
            type: msg.type,
        });
        if (msg.type === "error" || msg.type === "warning") {
            const root = getBoardRootForSession(event.sender.session);
            if (root) {
                try {
                    fs.appendFileSync(
                        path.join(root, "ui.log"),
                        `[${new Date().toISOString()}] [${msg.type}] ${msg.message}\n`,
                    );
                } catch {
                    // Logging must never throw into the bridge.
                }
            }
        }
    });

    // Native dialogs — delegate to the shared handlers, parented to the board's
    // embedder window. Each returns a path the page hands back to execute().
    ipcMain.handle(
        BoardBridgeChannel.openFileDialog,
        (event: IpcMainInvokeEvent, params: OpenFileDialogParams) =>
            showOpenFileDialog(ownerWindow(event), params ?? {}),
    );
    ipcMain.handle(
        BoardBridgeChannel.saveFileDialog,
        (event: IpcMainInvokeEvent, params: SaveFileDialogParams) =>
            showSaveFileDialog(ownerWindow(event), params ?? {}),
    );
    ipcMain.handle(
        BoardBridgeChannel.openFolderDialog,
        (event: IpcMainInvokeEvent, params: OpenFolderDialogParams) =>
            showOpenFolderDialog(ownerWindow(event), params ?? {}),
    );

    // File bridge (US-756 C4) — read/write any file without shelling a script. A
    // relative path resolves against the board root; parent dirs are created on write.
    // "utf8" (default) ↔ string, "base64" ↔ binary. A thrown error rejects the
    // caller's invoke() promise with its message.
    ipcMain.handle(
        BoardBridgeChannel.readFile,
        async (event: IpcMainInvokeEvent, msg: BoardReadFileMsg): Promise<string> => {
            const filePath = resolveBoardFilePath(event, msg?.path);
            const encoding: BufferEncoding = msg?.encoding === "base64" ? "base64" : "utf8";
            const buf = await fs.promises.readFile(filePath);
            return buf.toString(encoding);
        },
    );
    ipcMain.handle(
        BoardBridgeChannel.writeFile,
        async (event: IpcMainInvokeEvent, msg: BoardWriteFileMsg): Promise<void> => {
            const filePath = resolveBoardFilePath(event, msg?.path);
            const encoding: BufferEncoding = msg?.encoding === "base64" ? "base64" : "utf8";
            await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
            await fs.promises.writeFile(filePath, Buffer.from(msg?.data ?? "", encoding));
        },
    );
}
