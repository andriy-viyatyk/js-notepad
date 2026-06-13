import { app, BrowserWindow, ipcMain, IpcMainEvent, nativeTheme, shell } from "electron";
import { Api, Endpoint, EventEndpoint, McpStatus, MnemeStatus } from "../api-types";
import { getAssetPath, getAppRootPath } from "../../main/utils";
import { showOpenFileDialog, showOpenFolderDialog, showSaveFileDialog } from "./dialog-handlers";
import { getFileToOpen, getUrlToOpen, windowReady } from "./window-handlers";
import { DownloadEntry, OpenFileDialogParams, RuntimeVersions, SaveFileDialogParams, UpdateCheckResult, VideoStreamSessionConfig, VideoStreamSessionResult } from "../api-param-types";
import { openWindows } from "../../main/open-windows";
import { initRendererEvents } from "./renderer-events";
import { WindowPages, PageDragData } from "../../shared/types";
import { dragModel } from "../../main/drag-model";
import { fileIconCache } from "../../main/fileIconCache";
import { versionService } from "../../main/version-service";
import * as browserRegistration from "../../main/browser-registration";
import { downloadService } from "../../main/download-service";
import { startMcpHttpServer, stopMcpHttpServer, isMcpHttpServerRunning, getMcpUrl, getMcpClientCount } from "../../main/mcp-http-server";
import { startMneme, stopMneme, getMnemeStatus as getMnemeServiceStatus } from "../../main/mneme-service";
import { GitFetchOptions, GitIdentity, GitLogOptions, GitPullOptions, GitPushOptions, GitSwitchTarget } from "../git-ipc";

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

    getMnemeStatus = async (_event: IpcMainEvent): Promise<MnemeStatus> => {
        return getMnemeServiceStatus();
    }

    startScreenSnip = async (): Promise<string | null> => {
        const { startScreenSnip } = await import("../../main/snip-service");
        return startScreenSnip();
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
    bindEndpoint(Endpoint.getMnemeStatus, controllerInstance.getMnemeStatus);
    bindEndpoint(Endpoint.setBrowserToolsEnabled, controllerInstance.setBrowserToolsEnabled);
    bindEndpoint(Endpoint.startScreenSnip, controllerInstance.startScreenSnip);
    bindEndpoint(Endpoint.createVideoStreamSession, controllerInstance.createVideoStreamSession);
    bindEndpoint(Endpoint.deleteVideoStreamSession, controllerInstance.deleteVideoStreamSession);
    bindEndpoint(Endpoint.deleteVideoStreamSessionsByPage, controllerInstance.deleteVideoStreamSessionsByPage);
    bindEndpoint(Endpoint.openInVlc, controllerInstance.openInVlc);
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

    initRendererEvents();
}

export const controller = { init };