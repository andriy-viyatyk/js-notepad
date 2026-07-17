import { PageDragData, WindowPages } from "../../shared/types";
import {
    BoardArchiveDownloadRequest,
    CommonFolder,
    DownloadEntry,
    OpenFileDialogParams,
    OpenFolderDialogParams,
    PublishedBoardsResult,
    PublishedBoardVersions,
    RuntimeVersions,
    SaveFileDialogParams,
    UpdateCheckResult,
    VideoStreamSessionConfig,
    VideoStreamSessionResult,
} from "../api-param-types";
import { Api, CaptureRect, Endpoint, EventEndpoint, McpStatus, MnemeStatus } from "../api-types";
import { GitAheadBehind, GitCommit, GitFetchOptions, GitFileChange, GitIdentity, GitLogOptions, GitMutationResult, GitProbeResult, GitPullOptions, GitPullResult, GitPushOptions, GitPushResult, GitRefs, GitRepoInfo, GitStatusResult, GitSwitchTarget } from "../git-ipc";
import type { BoardThemePalette } from "../board-bridge-channels";
import type { ClipboardFileList } from "../clipboard-ipc";

let idGen = 0;
const idGenMax = 2000000000;
const getId = () => {
    if (idGen >= idGenMax) {
        idGen = 0;
    }
    return ++idGen;
};

function executeOnce<T = unknown>(command: Endpoint, ...args: unknown[]): Promise<T> {
    if (!window.electron) {
        return Promise.reject(new Error("window.electron is undefined"));
    }

    if (!window.electron.ipcRenderer) {
        return Promise.reject(
            new Error("window.electron.ipcRenderer is undefined")
        );
    }

    return new Promise<T>((resolve, reject) => {
        // commandId is used to identify the response to this command in case of multiple commands executing in parallel
        const commandId = getId();
        window.electron.ipcRenderer.once(
            `${command}_${commandId}`,
            (arg: unknown) => {
                if (arg instanceof Error) {
                    reject(arg);
                }
                resolve(arg as T);
            }
        );
        window.electron.ipcRenderer.sendMessage(command, args, commandId);
    });
}

class ApiCalls implements Api {
    getAppRootPath = async () => {
        return executeOnce<string>(Endpoint.getAppRootPath);
    };

    getAssetsPath = async (fileName: string) => {
        return executeOnce<string>(Endpoint.getAssetsPath, fileName);
    };

    getDataFolder = async () => {
        return executeOnce<string>(Endpoint.getDataFolder);
    };

    maximizeWindow = async () => {
        return executeOnce<void>(Endpoint.maximizeWindow);
    };

    minimizeWindow = async () => {
        return executeOnce<void>(Endpoint.minimizeWindow);
    };

    restoreWindow = async () => {
        return executeOnce<void>(Endpoint.restoreWindow);
    };

    closeWindow = async () => {
        return executeOnce<void>(Endpoint.closeWindow);
    };

    setCanQuit = async (canQuit: boolean) => {
        return executeOnce<void>(Endpoint.setCanQuit, canQuit);
    };

    showOpenFileDialog = async (params: OpenFileDialogParams) => {
        return executeOnce<string[] | undefined>(
            Endpoint.showOpenFileDialog,
            params
        );
    };

    showSaveFileDialog = async (params: SaveFileDialogParams) => {
        return executeOnce<string | undefined>(
            Endpoint.showSaveFileDialog,
            params
        );
    };

    showOpenFolderDialog = async (params: OpenFolderDialogParams) => {
        return executeOnce<string[] | undefined>(
            Endpoint.showOpenFolderDialog,
            params
        );
    };

    inspectElement = async (x: number, y: number) => {
        return executeOnce<void>(Endpoint.inspectElement, x, y);
    };

    getCommonFolder = async (folder: CommonFolder) => {
        return executeOnce<string>(Endpoint.getCommonFolder, folder);
    };

    zoom = async (delta: number) => {
        return executeOnce<void>(Endpoint.zoom, delta);
    };

    resetZoom = async () => {
        return executeOnce<void>(Endpoint.resetZoom);
    };

    showItemInFolder = async (path: string) => {
        return executeOnce<void>(Endpoint.showItemInFolder, path);
    };

    showFolder = async (path: string) => {
        return executeOnce<void>(Endpoint.showFolder, path);
    }

    windowReady = async () => {
        return executeOnce<void>(Endpoint.windowReady);
    };

    getFileToOpen = async () => {
        return executeOnce<string | undefined>(Endpoint.getFileToOpen);
    };

    getWindowIndex = async () => {
        return executeOnce<number>(Endpoint.getWindowIndex);
    };

    openNewWindow = async (filePath?: string) => {
        return executeOnce<number>(Endpoint.openNewWindow, filePath);
    };

    getWindowPages = async () => {
        return executeOnce<WindowPages[]>(Endpoint.getWindowPages);
    };

    showWindowPage = async (windowIndex: number, pageId: string) => {
        return executeOnce<void>(Endpoint.showWindowPage, windowIndex, pageId);
    };

    addDragEvent = async (event: PageDragData) => {
        return executeOnce<void>(Endpoint.addDragEvent, event);
    };

    getFileIcon = async (filePath: string) => {
        return executeOnce<string>(Endpoint.getFileIcon, filePath);
    }

    checkForUpdates = async (force?: boolean) => {
        return executeOnce<UpdateCheckResult>(Endpoint.checkForUpdates, force);
    }

    getAppVersion = async () => {
        return executeOnce<string>(Endpoint.getAppVersion);
    }

    getRuntimeVersions = async () => {
        return executeOnce<RuntimeVersions>(Endpoint.getRuntimeVersions);
    }

    setNativeTheme = async (mode: "light" | "dark") => {
        return executeOnce<void>(Endpoint.setNativeTheme, mode);
    }

    getUrlToOpen = async () => {
        return executeOnce<string | undefined>(Endpoint.getUrlToOpen);
    }

    registerAsDefaultBrowser = async () => {
        return executeOnce<void>(Endpoint.registerAsDefaultBrowser);
    }

    unregisterAsDefaultBrowser = async () => {
        return executeOnce<void>(Endpoint.unregisterAsDefaultBrowser);
    }

    isRegisteredAsDefaultBrowser = async () => {
        return executeOnce<boolean>(Endpoint.isRegisteredAsDefaultBrowser);
    }

    openDefaultAppsSettings = async () => {
        return executeOnce<void>(Endpoint.openDefaultAppsSettings);
    }

    getDownloads = async () => {
        return executeOnce<DownloadEntry[]>(Endpoint.getDownloads);
    }

    cancelDownload = async (id: string) => {
        return executeOnce<void>(Endpoint.cancelDownload, id);
    }

    openDownload = async (id: string) => {
        return executeOnce<void>(Endpoint.openDownload, id);
    }

    showDownloadInFolder = async (id: string) => {
        return executeOnce<void>(Endpoint.showDownloadInFolder, id);
    }

    clearCompletedDownloads = async () => {
        return executeOnce<void>(Endpoint.clearCompletedDownloads);
    }

    setMcpEnabled = async (enabled: boolean, port?: number) => {
        return executeOnce<void>(Endpoint.setMcpEnabled, enabled, port);
    }

    setBrowserToolsEnabled = async (enabled: boolean) => {
        return executeOnce<void>(Endpoint.setBrowserToolsEnabled, enabled);
    }

    getMcpStatus = async () => {
        return executeOnce<McpStatus>(Endpoint.getMcpStatus);
    }

    setMnemeEnabled = async (enabled: boolean, port?: number) => {
        return executeOnce<MnemeStatus>(Endpoint.setMnemeEnabled, enabled, port);
    }

    restartMneme = async (port?: number) => {
        return executeOnce<MnemeStatus>(Endpoint.restartMneme, port);
    }

    getMnemeStatus = async () => {
        return executeOnce<MnemeStatus>(Endpoint.getMnemeStatus);
    }

    startScreenSnip = async (hideWindows: boolean): Promise<string | null> => {
        return executeOnce<string | null>(Endpoint.startScreenSnip, hideWindows);
    }

    clipboardReadFilePaths = async (): Promise<ClipboardFileList> => {
        return executeOnce<ClipboardFileList>(Endpoint.clipboardReadFilePaths);
    }

    clipboardWriteFilePaths = async (paths: string[], cut: boolean): Promise<boolean> => {
        return executeOnce<boolean>(Endpoint.clipboardWriteFilePaths, paths, cut);
    }

    startOsFileDrag = async (paths: string[]): Promise<void> => {
        return executeOnce<void>(Endpoint.startOsFileDrag, paths);
    }

    createVideoStreamSession = async (config: VideoStreamSessionConfig, port?: number) => {
        return executeOnce<VideoStreamSessionResult>(Endpoint.createVideoStreamSession, config, port);
    };

    deleteVideoStreamSession = async (sessionId: string) => {
        return executeOnce<void>(Endpoint.deleteVideoStreamSession, sessionId);
    };

    deleteVideoStreamSessionsByPage = async (pageId: string) => {
        return executeOnce<void>(Endpoint.deleteVideoStreamSessionsByPage, pageId);
    };

    openInVlc = async (url: string, vlcPath?: string) => {
        return executeOnce<void>(Endpoint.openInVlc, url, vlcPath);
    };

    gitProbe = async () => {
        return executeOnce<GitProbeResult>(Endpoint.gitProbe);
    };

    gitDetectRepo = async (dir: string) => {
        return executeOnce<GitRepoInfo | null>(Endpoint.gitDetectRepo, dir);
    };

    gitLog = async (dir: string, opts: GitLogOptions = {}) => {
        return executeOnce<GitCommit[]>(Endpoint.gitLog, dir, opts);
    };

    gitShow = async (dir: string, rev: string, path: string) => {
        return executeOnce<string>(Endpoint.gitShow, dir, rev, path);
    };

    gitStatus = async (dir: string) => {
        return executeOnce<GitStatusResult>(Endpoint.gitStatus, dir);
    };

    gitCommitMessage = async (dir: string, hash: string) => {
        return executeOnce<string>(Endpoint.gitCommitMessage, dir, hash);
    };

    gitCommitFiles = async (dir: string, hash: string) => {
        return executeOnce<GitFileChange[]>(Endpoint.gitCommitFiles, dir, hash);
    };

    gitStage = async (dir: string, paths: string[]) => {
        return executeOnce<GitMutationResult>(Endpoint.gitStage, dir, paths);
    };

    gitUnstage = async (dir: string, paths: string[]) => {
        return executeOnce<GitMutationResult>(Endpoint.gitUnstage, dir, paths);
    };

    gitDiscard = async (dir: string, trackedPaths: string[], untrackedPaths: string[]) => {
        return executeOnce<GitMutationResult>(Endpoint.gitDiscard, dir, trackedPaths, untrackedPaths);
    };

    gitCommit = async (dir: string, message: string, identity?: GitIdentity) => {
        return executeOnce<GitMutationResult>(Endpoint.gitCommit, dir, message, identity);
    };

    gitIdentity = async (dir: string) => {
        return executeOnce<GitIdentity>(Endpoint.gitIdentity, dir);
    };

    gitRefs = async (dir: string) => {
        return executeOnce<GitRefs>(Endpoint.gitRefs, dir);
    };

    gitSwitch = async (dir: string, target: GitSwitchTarget) => {
        return executeOnce<GitMutationResult>(Endpoint.gitSwitch, dir, target);
    };

    gitCreateBranch = async (dir: string, name: string, startPoint?: string, checkout?: boolean) => {
        return executeOnce<GitMutationResult>(Endpoint.gitCreateBranch, dir, name, startPoint, checkout);
    };

    gitFetch = async (dir: string, opts?: GitFetchOptions) => {
        return executeOnce<GitMutationResult>(Endpoint.gitFetch, dir, opts);
    };

    gitAheadBehind = async (dir: string) => {
        return executeOnce<GitAheadBehind>(Endpoint.gitAheadBehind, dir);
    };

    gitPush = async (dir: string, opts?: GitPushOptions) => {
        return executeOnce<GitPushResult>(Endpoint.gitPush, dir, opts);
    };

    gitPull = async (dir: string, opts?: GitPullOptions) => {
        return executeOnce<GitPullResult>(Endpoint.gitPull, dir, opts);
    };

    gitRemoteUrl = async (dir: string, remote: string) => {
        return executeOnce<string>(Endpoint.gitRemoteUrl, dir, remote);
    };

    capturePageRegion = async (rect: CaptureRect) => {
        return executeOnce<Uint8Array>(Endpoint.capturePageRegion, rect);
    };

    // Map a board into the host-routed board:// registry; resolves to its stable
    // board:// host. Must complete before the iframe navigates board://<host>.
    registerBoard = async (
        boardRoot: string,
        theme: BoardThemePalette,
        tokens: Record<string, string>,
    ) => {
        return executeOnce<string>(Endpoint.registerBoard, boardRoot, theme, tokens);
    };

    unregisterBoard = async (host: string) => {
        return executeOnce<void>(Endpoint.unregisterBoard, host);
    };

    // Refresh the palette stored for live boards on a theme switch, so a board that
    // reloads after the switch is served the current theme by the board:// handler.
    // Main also fans the palette out to every live board port for a live retint.
    updateBoardTheme = async (theme: BoardThemePalette) => {
        return executeOnce<void>(Endpoint.updateBoardTheme, theme);
    };

    // Ask main to mint a per-board MessagePort (EPIC-037 / US-771). The port arrives
    // asynchronously on `eBoardPort` — subscribe via `onBoardPort` before requesting.
    // `ownerId` = the owning BoardEditorModel id, the stable job-retention key (US-799).
    requestBoardPort = async (boardId: string, host: string, ownerId: string) => {
        return executeOnce<void>(Endpoint.requestBoardPort, boardId, host, ownerId);
    };

    disposeBoardPort = async (boardId: string) => {
        return executeOnce<void>(Endpoint.disposeBoardPort, boardId);
    };

    // Busy retention (US-799): mirror the board model's busy flag to main so a busy
    // owner's jobs survive port disposal; reap everything on final teardown.
    setBoardBusy = async (ownerId: string, busy: boolean) => {
        return executeOnce<void>(Endpoint.setBoardBusy, ownerId, busy);
    };

    reapBoardOwner = async (ownerId: string) => {
        return executeOnce<void>(Endpoint.reapBoardOwner, ownerId);
    };

    // Receive the per-board MessagePort delivered by main. Uses the ports-aware
    // preload listener (the typed event system drops `event.ports`). Returns an
    // unsubscribe fn.
    onBoardPort = (cb: (boardId: string, port: MessagePort) => void): (() => void) => {
        return window.electron.ipcRenderer.onPort(EventEndpoint.eBoardPort, (payload, ports) => {
            const boardId = (payload as { boardId: string } | undefined)?.boardId;
            if (boardId && ports[0]) cb(boardId, ports[0]);
        });
    };

    // Register a board's board:// frame for CDP automation (EPIC-037 / US-773). Main
    // attaches the debugger to the calling window's webContents and routes commands to
    // the board frame. Call on each iframe load (a reload recreates the frame).
    registerBoardFrame = async (boardId: string, boardHost: string, frameNonce?: string, tab?: string) => {
        return executeOnce<void>(Endpoint.registerBoardFrame, boardId, boardHost, frameNonce, tab);
    };

    unregisterBoardFrame = async (boardId: string, tab?: string) => {
        return executeOnce<void>(Endpoint.unregisterBoardFrame, boardId, tab);
    };

    getPublishedBoards = async (force?: boolean) => {
        return executeOnce<PublishedBoardsResult>(Endpoint.getPublishedBoards, force);
    };

    getBoardVersions = async (id: string) => {
        return executeOnce<PublishedBoardVersions | null>(Endpoint.getBoardVersions, id);
    };

    downloadBoardArchive = async (req: BoardArchiveDownloadRequest) => {
        return executeOnce<string>(Endpoint.downloadBoardArchive, req);
    };

    cancelBoardDownload = async (installId: string) => {
        return executeOnce<void>(Endpoint.cancelBoardDownload, installId);
    };
}

export const api = new ApiCalls();
