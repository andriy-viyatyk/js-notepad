import { app, BrowserWindow, ipcMain, IpcMainEvent, shell } from "electron";
import { Api, Endpoint } from "../api-types";
import { getAssetPath, getAppRootPath } from "../../main/utils";
import { showOpenFileDialog, showOpenFolderDialog, showSaveFileDialog } from "./dialog-handlers";
import { getFileToOpen, windowReady } from "./window-handlers";
import { OpenFileDialogParams, SaveFileDialogParams } from "../api-param-types";
import { openWindows } from "../../main/open-windows";
import { initPreloadEvents } from "./preload-events";
import { WindowPages } from "../../shared/types";
import { dragModel } from "../../main/drag-model";

type AddEventParam<T> = T extends (...args: infer Args) => infer Return
    ? (event: IpcMainEvent, ...args: Args) => Return
    : never;

export type MainApi = {
    [K in keyof Api]: AddEventParam<Api[K]>;
};

class Controller implements MainApi {
    getAppRootPath = async (event: IpcMainEvent): Promise<string> => {
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
        return app.getPath(folder as any);
    }

    zoom = async (event: IpcMainEvent, delta: number): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        const currentZoom = window?.webContents.getZoomLevel() || 0;
        window?.webContents.setZoomLevel(currentZoom + delta);
    }

    showItemInFolder = async (event: IpcMainEvent, path: string): Promise<void> => {
        await shell.showItemInFolder(path);
    }

    windowReady = async (event: IpcMainEvent): Promise<void> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        return windowReady(window);
    }
    getFileToOpen = async (event: IpcMainEvent): Promise<string | undefined> => {
        return getFileToOpen();
    }

    getWindowIndex = async (event: IpcMainEvent): Promise<number> => {
        const window = BrowserWindow.fromWebContents(event.sender);
        return openWindows.findByWindow(window)?.index ?? -1;
    }

    openNewWindow = async (event: IpcMainEvent): Promise<number> => {
        const newWindow = openWindows.createWindow();
        return newWindow.index;
    }

    getWindowPages = async (event: IpcMainEvent): Promise<WindowPages[]> => {
        return openWindows.getWindowPages();
    }

    showWindowPage = async (event: IpcMainEvent, windowIndex: number, pageId: string): Promise<void> => {
        openWindows.showWindowPage(windowIndex, pageId);
    }

    addDragEvent = async (event: IpcMainEvent, dragData: any): Promise<void> => {
        return dragModel.addDragEvent(dragData);
    }
}

const controllerInstance = new Controller();

function bindEndpoint(command: Endpoint, handler: (...args: any[]) => any) {
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
    bindEndpoint(Endpoint.showItemInFolder, controllerInstance.showItemInFolder);
    bindEndpoint(Endpoint.windowReady, controllerInstance.windowReady);
    bindEndpoint(Endpoint.getFileToOpen, controllerInstance.getFileToOpen);
    bindEndpoint(Endpoint.getWindowIndex, controllerInstance.getWindowIndex);
    bindEndpoint(Endpoint.openNewWindow, controllerInstance.openNewWindow);
    bindEndpoint(Endpoint.getWindowPages, controllerInstance.getWindowPages);
    bindEndpoint(Endpoint.showWindowPage, controllerInstance.showWindowPage);
    bindEndpoint(Endpoint.addDragEvent, controllerInstance.addDragEvent);

    initPreloadEvents();
}

export const controller = { init };