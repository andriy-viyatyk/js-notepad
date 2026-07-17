import { app, BrowserWindow, ipcMain, IpcMainEvent, nativeTheme, shell } from "electron";
import { Api, BOARD_CDP_TAB, CaptureRect, Endpoint, EventEndpoint, McpStatus, MnemeStatus } from "../api-types";
import { getAssetPath, getAppRootPath, getDataFolder } from "../../main/utils";
import { showOpenFileDialog, showOpenFolderDialog, showSaveFileDialog } from "./dialog-handlers";
import { getFileToOpen, getUrlToOpen, windowReady } from "./window-handlers";
import { BoardArchiveDownloadRequest, DownloadEntry, OpenFileDialogParams, PublishedBoardsResult, PublishedBoardVersions, RuntimeVersions, SaveFileDialogParams, UpdateCheckResult, VideoStreamSessionConfig, VideoStreamSessionResult } from "../api-param-types";
import { openWindows } from "../../main/open-windows";
import { initRendererEvents } from "./renderer-events";
import { WindowPages, PageDragData } from "../../shared/types";
import { dragModel } from "../../main/drag-model";
import { fileIconCache } from "../../main/fileIconCache";
import { versionService } from "../../main/version-service";
import * as browserRegistration from "../../main/browser-registration";
import { downloadService } from "../../main/download-service";
import { startMcpHttpServer, stopMcpHttpServer, isMcpHttpServerRunning, getMcpUrl, getMcpClientCount } from "../../main/mcp-http-server";
import { startMneme, stopMneme, restartMneme, getMnemeStatus as getMnemeServiceStatus } from "../../main/mneme-service";
import { GitFetchOptions, GitIdentity, GitLogOptions, GitPullOptions, GitPushOptions, GitSwitchTarget } from "../git-ipc";
import type { BoardThemePalette } from "../board-bridge-channels";
import type { ClipboardFileList } from "../clipboard-ipc";

type AddEventParam<T> = T extends (...args: infer Args) => infer Return
    ? (event: IpcMainEvent, ...args: Args) => Return
    : never;

export type MainApi = {
    [K in keyof Api]: AddEventParam<Api[K]>;
};

class Controller implements MainApi {
    getAppRootPath = async (_event: IpcMainEvent): Promise<string> => {
        return getAppRootPath();
    }

    getAssetsPath = async (event: IpcMainEvent, fileName: string): Promise<string> => {
        return getAssetPath() + `/${fileName}`;
    }

    getDataFolder = async (_event: IpcMainEvent): Promise<string> => {
        return getDataFolder();
    }

    maximizeWindow = async (event: IpcMainEvent): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.maximize();
    }

    minimizeWindow = async (event: IpcMainEvent): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.minimize();
    }

    restoreWindow = async (event: IpcMainEvent): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.restore();
    }

    closeWindow = async (event: IpcMainEvent): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.close();
    }

    setCanQuit = async (event: IpcMainEvent, canQuit: boolean): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        openWindows.setCanQuit(window, canQuit);
    }

    showOpenFileDialog = (event: IpcMainEvent, params: OpenFileDialogParams) => {
        return showOpenFileDialog(BrowserWindow.fromWebContents(event.sender), params);
    }
    showSaveFileDialog = (event: IpcMainEvent, params: SaveFileDialogParams) => {
        return showSaveFileDialog(BrowserWindow.fromWebContents(event.sender), params);
    }
    showOpenFolderDialog = (event: IpcMainEvent, params: OpenFileDialogParams) => {
        return showOpenFolderDialog(BrowserWindow.fromWebContents(event.sender), params);
    }

    inspectElement = async (event: IpcMainEvent, x: number, y: number): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.webContents.inspectElement(x, y);
    }

    getCommonFolder = async (event: IpcMainEvent, folder: string): Promise<string> => {
        return app.getPath(folder as Parameters<typeof app.getPath>[0]);
    }

    zoom = async (event: IpcMainEvent, delta: number): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const currentZoom = window?.webContents.getZoomLevel() || 0;
        const newZoom = currentZoom + delta;
        window?.webContents.setZoomLevel(newZoom);
        window?.webContents.send(EventEndpoint.eZoomChanged, newZoom);
    }

    resetZoom = async (event: IpcMainEvent): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        window?.webContents.setZoomLevel(0);
        window?.webContents.send(EventEndpoint.eZoomChanged, 0);
    }

    showItemInFolder = async (event: IpcMainEvent, path: string): Promise<void> => {
        await shell.showItemInFolder(path);
    }

    showFolder = async (event: IpcMainEvent, path: string): Promise<void> => {
        await shell.openPath(path);
    }

    windowReady = async (event: IpcMainEvent): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        return windowReady(window);
    }
    getFileToOpen = async (_event: IpcMainEvent): Promise<string | undefined> => {
        return getFileToOpen();
    }

    getUrlToOpen = async (_event: IpcMainEvent): Promise<string | undefined> => {
        return getUrlToOpen();
    }

    getWindowIndex = async (event: IpcMainEvent): Promise<number> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        return openWindows.findByWindow(window)?.index ?? -1;
    }

    openNewWindow = async (event: IpcMainEvent, filePath?: string): Promise<number> => {
        if (filePath) {
            return await openWindows.openPathInNewWindow(filePath);
        }
        const newWindow = openWindows.createWindow();
        return newWindow.index;
    }

    getWindowPages = async (_event: IpcMainEvent): Promise<WindowPages[]> => {
        return openWindows.getWindowPages();
    }

    showWindowPage = async (event: IpcMainEvent, windowIndex: number, pageId: string): Promise<void> => {
        openWindows.showWindowPage(windowIndex, pageId);
    }

    addDragEvent = async (event: IpcMainEvent, dragData: PageDragData): Promise<void> => {
        return dragModel.addDragEvent(dragData);
    }

    getFileIcon = async (event: IpcMainEvent, filePath: string): Promise<string> => {
        return fileIconCache.getFileIcon(filePath);
    }

    checkForUpdates = async (event: IpcMainEvent, force?: boolean): Promise<UpdateCheckResult> => {
        return versionService.checkForUpdates(force);
    }

    getAppVersion = async (_event: IpcMainEvent): Promise<string> => {
        return versionService.getAppVersion();
    }

    getRuntimeVersions = async (_event: IpcMainEvent): Promise<RuntimeVersions> => {
        return versionService.getRuntimeVersions();
    }

    setNativeTheme = async (event: IpcMainEvent, mode: "light" | "dark"): Promise<void> => {
        nativeTheme.themeSource = mode;
    }

    registerAsDefaultBrowser = async (_event: IpcMainEvent): Promise<void> => {
        browserRegistration.registerAsDefaultBrowser();
    }

    unregisterAsDefaultBrowser = async (_event: IpcMainEvent): Promise<void> => {
        browserRegistration.unregisterAsDefaultBrowser();
    }

    isRegisteredAsDefaultBrowser = async (_event: IpcMainEvent): Promise<boolean> => {
        return browserRegistration.isRegisteredAsDefaultBrowser();
    }

    openDefaultAppsSettings = async (_event: IpcMainEvent): Promise<void> => {
        browserRegistration.openDefaultAppsSettings();
    }

    getDownloads = async (_event: IpcMainEvent): Promise<DownloadEntry[]> => {
        return downloadService.getDownloads();
    }

    cancelDownload = async (event: IpcMainEvent, id: string): Promise<void> => {
        downloadService.cancelDownload(id);
    }

    openDownload = async (event: IpcMainEvent, id: string): Promise<void> => {
        downloadService.openDownload(id);
    }

    showDownloadInFolder = async (event: IpcMainEvent, id: string): Promise<void> => {
        downloadService.showInFolder(id);
    }

    clearCompletedDownloads = async (_event: IpcMainEvent): Promise<void> => {
        downloadService.clearCompleted();
    }

    setMcpEnabled = async (event: IpcMainEvent, enabled: boolean, port?: number): Promise<void> => {
        if (enabled) {
            await startMcpHttpServer(port);
        } else {
            await stopMcpHttpServer();
        }
    }

    setBrowserToolsEnabled = async (event: IpcMainEvent, enabled: boolean): Promise<void> => {
        const { setBrowserToolsEnabled } = await import("../../main/mcp-http-server");
        setBrowserToolsEnabled(enabled);
    }

    getMcpStatus = async (_event: IpcMainEvent): Promise<McpStatus> => {
        return {
            running: isMcpHttpServerRunning(),
            url: getMcpUrl(),
            clientCount: getMcpClientCount(),
        };
    }

    setMnemeEnabled = async (event: IpcMainEvent, enabled: boolean, port?: number): Promise<MnemeStatus> => {
        if (enabled) {
            return startMneme(port);
        }
        stopMneme();
        return getMnemeServiceStatus();
    }

    restartMneme = async (_event: IpcMainEvent, port?: number): Promise<MnemeStatus> => {
        return restartMneme(port);
    }

    getMnemeStatus = async (_event: IpcMainEvent): Promise<MnemeStatus> => {
        return getMnemeServiceStatus();
    }

    startScreenSnip = async (event: IpcMainEvent, hideWindows: boolean): Promise<string | null> => {
        const { startScreenSnip } = await import("../../main/snip-service");
        return startScreenSnip(hideWindows);
    }

    clipboardReadFilePaths = async (_event: IpcMainEvent): Promise<ClipboardFileList> => {
        const { readClipboardFiles } = await import("../../main/clip-service");
        return readClipboardFiles();
    }

    clipboardWriteFilePaths = async (_event: IpcMainEvent, paths: string[], cut: boolean): Promise<boolean> => {
        const { writeClipboardFiles } = await import("../../main/clip-service");
        return writeClipboardFiles(paths, cut);
    }

    startOsFileDrag = async (event: IpcMainEvent, paths: string[]): Promise<void> => {
        const { startOsFileDrag } = await import("../../main/os-drag-service");
        return startOsFileDrag(event.sender, paths);
    }

    createVideoStreamSession = async (
        event: IpcMainEvent,
        config: VideoStreamSessionConfig,
        port?: number,
    ): Promise<VideoStreamSessionResult> => {
        const { createSession } = await import("../../main/video-stream-server");
        return createSession(config, port);
    };

    deleteVideoStreamSession = async (event: IpcMainEvent, sessionId: string): Promise<void> => {
        const { deleteSession } = await import("../../main/video-stream-server");
        deleteSession(sessionId);
    };

    deleteVideoStreamSessionsByPage = async (event: IpcMainEvent, pageId: string): Promise<void> => {
        const { deleteSessionsByPage } = await import("../../main/video-stream-server");
        deleteSessionsByPage(pageId);
    };

    openTerminal = async (event: IpcMainEvent, path: string, command: string): Promise<void> => {
        const { openTerminalAt } = await import("../../main/terminal-launcher");
        openTerminalAt(path, command);
    };

    detectTerminal = async (_event: IpcMainEvent): Promise<string> => {
        const { detectTerminal } = await import("../../main/terminal-launcher");
        return detectTerminal();
    };

    openInVlc = async (event: IpcMainEvent, url: string, vlcPath?: string): Promise<void> => {
        const { openInVlc } = await import("../../main/vlc-launcher");
        openInVlc(url, vlcPath);
    };

    gitProbe = async (_event: IpcMainEvent) => {
        const { probeGit } = await import("../../main/git-service");
        return probeGit();
    };

    gitDetectRepo = async (_event: IpcMainEvent, dir: string) => {
        const { detectRepo } = await import("../../main/git-service");
        return detectRepo(dir);
    };

    gitLog = async (_event: IpcMainEvent, dir: string, opts: GitLogOptions) => {
        const { log } = await import("../../main/git-service");
        return log(dir, opts);
    };

    gitShow = async (_event: IpcMainEvent, dir: string, rev: string, path: string) => {
        const { show } = await import("../../main/git-service");
        return show(dir, rev, path);
    };

    gitStatus = async (_event: IpcMainEvent, dir: string) => {
        const { status } = await import("../../main/git-service");
        return status(dir);
    };

    gitCommitMessage = async (_event: IpcMainEvent, dir: string, hash: string) => {
        const { commitMessage } = await import("../../main/git-service");
        return commitMessage(dir, hash);
    };

    gitCommitFiles = async (_event: IpcMainEvent, dir: string, hash: string) => {
        const { commitFiles } = await import("../../main/git-service");
        return commitFiles(dir, hash);
    };

    gitStage = async (_event: IpcMainEvent, dir: string, paths: string[]) => {
        const { stage } = await import("../../main/git-service");
        return stage(dir, paths);
    };

    gitUnstage = async (_event: IpcMainEvent, dir: string, paths: string[]) => {
        const { unstage } = await import("../../main/git-service");
        return unstage(dir, paths);
    };

    gitDiscard = async (_event: IpcMainEvent, dir: string, trackedPaths: string[], untrackedPaths: string[]) => {
        const { discard } = await import("../../main/git-service");
        return discard(dir, trackedPaths, untrackedPaths);
    };

    gitCommit = async (_event: IpcMainEvent, dir: string, message: string, identity?: GitIdentity) => {
        const { commit } = await import("../../main/git-service");
        return commit(dir, message, identity);
    };

    gitIdentity = async (_event: IpcMainEvent, dir: string) => {
        const { getIdentity } = await import("../../main/git-service");
        return getIdentity(dir);
    };

    gitRefs = async (_event: IpcMainEvent, dir: string) => {
        const { refs } = await import("../../main/git-service");
        return refs(dir);
    };

    gitSwitch = async (_event: IpcMainEvent, dir: string, target: GitSwitchTarget) => {
        const { switchTo } = await import("../../main/git-service");
        return switchTo(dir, target);
    };

    gitCreateBranch = async (_event: IpcMainEvent, dir: string, name: string, startPoint?: string, checkout?: boolean) => {
        const { createBranch } = await import("../../main/git-service");
        return createBranch(dir, name, startPoint, checkout);
    };

    gitFetch = async (_event: IpcMainEvent, dir: string, opts?: GitFetchOptions) => {
        const { fetch } = await import("../../main/git-service");
        return fetch(dir, opts);
    };

    gitAheadBehind = async (_event: IpcMainEvent, dir: string) => {
        const { aheadBehind } = await import("../../main/git-service");
        return aheadBehind(dir);
    };

    gitPush = async (_event: IpcMainEvent, dir: string, opts?: GitPushOptions) => {
        const { push } = await import("../../main/git-service");
        return push(dir, opts);
    };

    gitPull = async (_event: IpcMainEvent, dir: string, opts?: GitPullOptions) => {
        const { pull } = await import("../../main/git-service");
        return pull(dir, opts);
    };

    gitRemoteUrl = async (_event: IpcMainEvent, dir: string, remote: string) => {
        const { remoteUrl } = await import("../../main/git-service");
        return remoteUrl(dir, remote);
    };

    capturePageRegion = async (event: IpcMainEvent, rect: CaptureRect): Promise<Uint8Array> => {
        const wc = event.sender;
        // getBoundingClientRect() reports CSS pixels; capturePage() expects DIP.
        // When the user has zoomed (Ctrl +/-), scale the rect so the capture stays aligned.
        const zf = wc.getZoomFactor();
        const image = await wc.capturePage({
            x: Math.round(rect.x * zf),
            y: Math.round(rect.y * zf),
            width: Math.round(rect.width * zf),
            height: Math.round(rect.height * zf),
        });
        return image.toPNG();
    };

    registerBoard = async (event: IpcMainEvent, boardRoot: string, theme: BoardThemePalette, tokens: Record<string, string>): Promise<string> => {
        const { registerBoard } = await import("../../main/board-protocol-service");
        // The host renderer's origin (the frame that will broker the port handshake)
        // is baked into the served shim so it can validate the handshake message
        // (EPIC-037 / US-771 C2). Derive it from the calling webContents.
        let hostOrigin = "";
        try {
            hostOrigin = new URL(event.sender.getURL()).origin;
        } catch {
            // Leave empty — the shim falls back to the event.source === window.parent check.
        }
        const host = registerBoard(boardRoot, theme, tokens, hostOrigin);
        // Wire mode-A load-failure reporting now, at mount — a failed main doc never fires
        // the iframe `load` that would otherwise wire it via `requestBoardPort` (EPIC-037 C11).
        const { ensureHostWired } = await import("../../main/board-bridge");
        ensureHostWired(event.sender);
        return host;
    };

    unregisterBoard = async (_event: IpcMainEvent, host: string): Promise<void> => {
        const { unregisterBoard } = await import("../../main/board-protocol-service");
        unregisterBoard(host);
    };

    updateBoardTheme = async (_event: IpcMainEvent, theme: BoardThemePalette): Promise<void> => {
        const { updateAllBoardThemes } = await import("../../main/board-protocol-service");
        updateAllBoardThemes(theme);
        // Live retint of running boards (US-771): push the new palette over every
        // board port; the shim re-applies --p-* and fires onThemeChange.
        const { pushThemeToBoards } = await import("../../main/board-bridge");
        pushThemeToBoards(theme);
    };

    requestBoardPort = async (event: IpcMainEvent, boardId: string, host: string, ownerId: string): Promise<void> => {
        const { createBoardPort } = await import("../../main/board-bridge");
        createBoardPort(event.sender, boardId, host, ownerId);
    };

    disposeBoardPort = async (_event: IpcMainEvent, boardId: string): Promise<void> => {
        const { disposeBoardPort } = await import("../../main/board-bridge");
        disposeBoardPort(boardId);
    };

    setBoardBusy = async (_event: IpcMainEvent, ownerId: string, busy: boolean): Promise<void> => {
        const { setBoardBusy } = await import("../../main/board-bridge");
        setBoardBusy(ownerId, busy);
    };

    reapBoardOwner = async (_event: IpcMainEvent, ownerId: string): Promise<void> => {
        const { reapBoardOwner } = await import("../../main/board-bridge");
        reapBoardOwner(ownerId);
    };

    registerBoardFrame = async (event: IpcMainEvent, boardId: string, boardHost: string, frameNonce?: string, tab: string = BOARD_CDP_TAB): Promise<void> => {
        const { registerBoardFrame } = await import("../../main/cdp-service");
        // The board is a frame of the CALLING renderer's webContents — register that as
        // the host wc (correct window for multi-window; EPIC-037 / US-773). CDP routes
        // commands to the board:// frame within it. `frameNonce` (the iframe's ?v= value)
        // disambiguates THIS tab's frame from other tabs of the same board (same origin)
        // and from the pre-reload frame after a remount (US-796). `tab` is the frame's
        // automation role — `main` for the board's main view or `board-secondary:<viewId>`
        // for a secondary sidebar frame (EPIC-044 / US-858) — so every frame keys its own
        // registration instead of the secondary clobbering the main one.
        registerBoardFrame(`${boardId}/${tab}`, event.sender, boardHost, frameNonce);
    };

    unregisterBoardFrame = async (_event: IpcMainEvent, boardId: string, tab: string = BOARD_CDP_TAB): Promise<void> => {
        const { unregisterBoardFrame } = await import("../../main/cdp-service");
        unregisterBoardFrame(`${boardId}/${tab}`);
    };

    getPublishedBoards = async (_event: IpcMainEvent, force?: boolean): Promise<PublishedBoardsResult> => {
        const { publishedBoardsService } = await import("../../main/published-boards-service");
        return publishedBoardsService.getPublishedBoards(force);
    };

    getBoardVersions = async (_event: IpcMainEvent, id: string): Promise<PublishedBoardVersions | null> => {
        const { publishedBoardsService } = await import("../../main/published-boards-service");
        return publishedBoardsService.getBoardVersions(id);
    };

    downloadBoardArchive = async (_event: IpcMainEvent, req: BoardArchiveDownloadRequest): Promise<string> => {
        const { boardDownloadService } = await import("../../main/board-download-service");
        return boardDownloadService.downloadBoardArchive(req);
    };

    cancelBoardDownload = async (_event: IpcMainEvent, installId: string): Promise<void> => {
        const { boardDownloadService } = await import("../../main/board-download-service");
        boardDownloadService.cancelBoardDownload(installId);
    };
}

const controllerInstance = new Controller();

function bindEndpoint(command: Endpoint, handler: (...args: unknown[]) => unknown) {
    ipcMain.on(command, async (event, arg, commandId) => {
        try {
            const result = await handler(event, ...arg);
            event.reply(`${command}_${commandId}`, result);
        } catch (e) {
            console.error('Api Error:', e);
            const error = new Error(e?.toString?.() ?? 'Unknown error');
            event.reply(`${command}_${commandId}`, error);
        }
    });
}

const init = () => {
    bindEndpoint(Endpoint.getAppRootPath, controllerInstance.getAppRootPath);
    bindEndpoint(Endpoint.getAssetsPath, controllerInstance.getAssetsPath);
    bindEndpoint(Endpoint.getDataFolder, controllerInstance.getDataFolder);
    bindEndpoint(Endpoint.maximizeWindow, controllerInstance.maximizeWindow);
    bindEndpoint(Endpoint.minimizeWindow, controllerInstance.minimizeWindow);
    bindEndpoint(Endpoint.restoreWindow, controllerInstance.restoreWindow);
    bindEndpoint(Endpoint.closeWindow, controllerInstance.closeWindow);
    bindEndpoint(Endpoint.setCanQuit, controllerInstance.setCanQuit);
    bindEndpoint(Endpoint.showOpenFileDialog, controllerInstance.showOpenFileDialog);
    bindEndpoint(Endpoint.showSaveFileDialog, controllerInstance.showSaveFileDialog);
    bindEndpoint(Endpoint.showOpenFolderDialog, controllerInstance.showOpenFolderDialog);
    bindEndpoint(Endpoint.inspectElement, controllerInstance.inspectElement);
    bindEndpoint(Endpoint.getCommonFolder, controllerInstance.getCommonFolder);
    bindEndpoint(Endpoint.zoom, controllerInstance.zoom);
    bindEndpoint(Endpoint.resetZoom, controllerInstance.resetZoom);
    bindEndpoint(Endpoint.showItemInFolder, controllerInstance.showItemInFolder);
    bindEndpoint(Endpoint.showFolder, controllerInstance.showFolder);
    bindEndpoint(Endpoint.windowReady, controllerInstance.windowReady);
    bindEndpoint(Endpoint.getFileToOpen, controllerInstance.getFileToOpen);
    bindEndpoint(Endpoint.getUrlToOpen, controllerInstance.getUrlToOpen);
    bindEndpoint(Endpoint.getWindowIndex, controllerInstance.getWindowIndex);
    bindEndpoint(Endpoint.openNewWindow, controllerInstance.openNewWindow);
    bindEndpoint(Endpoint.getWindowPages, controllerInstance.getWindowPages);
    bindEndpoint(Endpoint.showWindowPage, controllerInstance.showWindowPage);
    bindEndpoint(Endpoint.addDragEvent, controllerInstance.addDragEvent);
    bindEndpoint(Endpoint.getFileIcon, controllerInstance.getFileIcon);
    bindEndpoint(Endpoint.checkForUpdates, controllerInstance.checkForUpdates);
    bindEndpoint(Endpoint.getAppVersion, controllerInstance.getAppVersion);
    bindEndpoint(Endpoint.getRuntimeVersions, controllerInstance.getRuntimeVersions);
    bindEndpoint(Endpoint.setNativeTheme, controllerInstance.setNativeTheme);
    bindEndpoint(Endpoint.registerAsDefaultBrowser, controllerInstance.registerAsDefaultBrowser);
    bindEndpoint(Endpoint.unregisterAsDefaultBrowser, controllerInstance.unregisterAsDefaultBrowser);
    bindEndpoint(Endpoint.isRegisteredAsDefaultBrowser, controllerInstance.isRegisteredAsDefaultBrowser);
    bindEndpoint(Endpoint.openDefaultAppsSettings, controllerInstance.openDefaultAppsSettings);
    bindEndpoint(Endpoint.getDownloads, controllerInstance.getDownloads);
    bindEndpoint(Endpoint.cancelDownload, controllerInstance.cancelDownload);
    bindEndpoint(Endpoint.openDownload, controllerInstance.openDownload);
    bindEndpoint(Endpoint.showDownloadInFolder, controllerInstance.showDownloadInFolder);
    bindEndpoint(Endpoint.clearCompletedDownloads, controllerInstance.clearCompletedDownloads);
    bindEndpoint(Endpoint.setMcpEnabled, controllerInstance.setMcpEnabled);
    bindEndpoint(Endpoint.getMcpStatus, controllerInstance.getMcpStatus);
    bindEndpoint(Endpoint.setMnemeEnabled, controllerInstance.setMnemeEnabled);
    bindEndpoint(Endpoint.restartMneme, controllerInstance.restartMneme);
    bindEndpoint(Endpoint.getMnemeStatus, controllerInstance.getMnemeStatus);
    bindEndpoint(Endpoint.setBrowserToolsEnabled, controllerInstance.setBrowserToolsEnabled);
    bindEndpoint(Endpoint.startScreenSnip, controllerInstance.startScreenSnip);
    bindEndpoint(Endpoint.clipboardReadFilePaths, controllerInstance.clipboardReadFilePaths);
    bindEndpoint(Endpoint.clipboardWriteFilePaths, controllerInstance.clipboardWriteFilePaths);
    bindEndpoint(Endpoint.startOsFileDrag, controllerInstance.startOsFileDrag);
    bindEndpoint(Endpoint.createVideoStreamSession, controllerInstance.createVideoStreamSession);
    bindEndpoint(Endpoint.deleteVideoStreamSession, controllerInstance.deleteVideoStreamSession);
    bindEndpoint(Endpoint.deleteVideoStreamSessionsByPage, controllerInstance.deleteVideoStreamSessionsByPage);
    bindEndpoint(Endpoint.openInVlc, controllerInstance.openInVlc);
    bindEndpoint(Endpoint.openTerminal, controllerInstance.openTerminal);
    bindEndpoint(Endpoint.detectTerminal, controllerInstance.detectTerminal);
    bindEndpoint(Endpoint.gitProbe, controllerInstance.gitProbe);
    bindEndpoint(Endpoint.gitDetectRepo, controllerInstance.gitDetectRepo);
    bindEndpoint(Endpoint.gitLog, controllerInstance.gitLog);
    bindEndpoint(Endpoint.gitShow, controllerInstance.gitShow);
    bindEndpoint(Endpoint.gitStatus, controllerInstance.gitStatus);
    bindEndpoint(Endpoint.gitCommitMessage, controllerInstance.gitCommitMessage);
    bindEndpoint(Endpoint.gitCommitFiles, controllerInstance.gitCommitFiles);
    bindEndpoint(Endpoint.gitStage, controllerInstance.gitStage);
    bindEndpoint(Endpoint.gitUnstage, controllerInstance.gitUnstage);
    bindEndpoint(Endpoint.gitDiscard, controllerInstance.gitDiscard);
    bindEndpoint(Endpoint.gitCommit, controllerInstance.gitCommit);
    bindEndpoint(Endpoint.gitIdentity, controllerInstance.gitIdentity);
    bindEndpoint(Endpoint.gitRefs, controllerInstance.gitRefs);
    bindEndpoint(Endpoint.gitSwitch, controllerInstance.gitSwitch);
    bindEndpoint(Endpoint.gitCreateBranch, controllerInstance.gitCreateBranch);
    bindEndpoint(Endpoint.gitFetch, controllerInstance.gitFetch);
    bindEndpoint(Endpoint.gitAheadBehind, controllerInstance.gitAheadBehind);
    bindEndpoint(Endpoint.gitPush, controllerInstance.gitPush);
    bindEndpoint(Endpoint.gitPull, controllerInstance.gitPull);
    bindEndpoint(Endpoint.gitRemoteUrl, controllerInstance.gitRemoteUrl);
    bindEndpoint(Endpoint.capturePageRegion, controllerInstance.capturePageRegion);
    bindEndpoint(Endpoint.registerBoard, controllerInstance.registerBoard);
    bindEndpoint(Endpoint.unregisterBoard, controllerInstance.unregisterBoard);
    bindEndpoint(Endpoint.updateBoardTheme, controllerInstance.updateBoardTheme);
    bindEndpoint(Endpoint.requestBoardPort, controllerInstance.requestBoardPort);
    bindEndpoint(Endpoint.disposeBoardPort, controllerInstance.disposeBoardPort);
    bindEndpoint(Endpoint.setBoardBusy, controllerInstance.setBoardBusy);
    bindEndpoint(Endpoint.reapBoardOwner, controllerInstance.reapBoardOwner);
    bindEndpoint(Endpoint.registerBoardFrame, controllerInstance.registerBoardFrame);
    bindEndpoint(Endpoint.unregisterBoardFrame, controllerInstance.unregisterBoardFrame);
    bindEndpoint(Endpoint.getPublishedBoards, controllerInstance.getPublishedBoards);
    bindEndpoint(Endpoint.getBoardVersions, controllerInstance.getBoardVersions);
    bindEndpoint(Endpoint.downloadBoardArchive, controllerInstance.downloadBoardArchive);
    bindEndpoint(Endpoint.cancelBoardDownload, controllerInstance.cancelBoardDownload);

    initRendererEvents();
}

export const controller = { init };