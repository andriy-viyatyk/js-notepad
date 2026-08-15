import { app, BrowserWindow, IpcMainEvent, nativeTheme, shell } from "electron";
import { CaptureRect, Endpoint, EventEndpoint, McpStatus, MnemeStatus } from "../api-types";
import { getAssetPath, getAppRootPath, getDataFolder } from "../../main/utils";
import { showOpenFileDialog, showOpenFolderDialog, showSaveFileDialog } from "./dialog-handlers";
import { getFileToOpen, getUrlToOpen, windowReady } from "./window-handlers";
import { DownloadEntry, OpenFileDialogParams, RuntimeVersions, SaveFileDialogParams, UpdateCheckResult, VideoStreamSessionConfig, VideoStreamSessionResult } from "../api-param-types";
import { openWindows } from "../../main/open-windows";
import { WindowPages, PageDragData } from "../../shared/types";
import { dragModel } from "../../main/drag-model";
import { fileIconCache } from "../../main/fileIconCache";
import { versionService } from "../../main/version-service";
import * as browserRegistration from "../../main/browser-registration";
import { downloadService } from "../../main/download-service";
import { startMcpHttpServer, stopMcpHttpServer, isMcpHttpServerRunning, getMcpUrl, getMcpClientCount } from "../../main/mcp-http-server";
import { startMneme, stopMneme, restartMneme, getMnemeStatus as getMnemeServiceStatus } from "../../main/mneme-service";
import type { ClipboardFileList } from "../clipboard-ipc";
import { bindEndpoint, type MainApi } from "./endpoint-registry";
import type { BoardEndpoint } from "./board-handlers";
import type { GitEndpoint } from "./git-handlers";

class Controller implements Omit<MainApi, BoardEndpoint | GitEndpoint> {
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

    /** Open a file or folder with the OS default application. Same `shell.openPath` as
     *  `showFolder`, but the error string is returned instead of discarded: the shell
     *  reports "no application is registered for this extension" that way, and without
     *  it an unopenable file looks like a menu item that does nothing. Empty = accepted. */
    openPath = async (event: IpcMainEvent, path: string): Promise<string> => {
        return shell.openPath(path);
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


}

const controllerInstance = new Controller();

/** Register core desktop and local-service renderer endpoints. */
export function initCoreHandlers(): void {
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
    bindEndpoint(Endpoint.openPath, controllerInstance.openPath);
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
    bindEndpoint(Endpoint.capturePageRegion, controllerInstance.capturePageRegion);
}
