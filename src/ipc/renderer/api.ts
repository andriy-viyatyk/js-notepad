import { PageDragData, WindowPages } from "../../shared/types";
import {
    CommonFolder,
    OpenFileDialogParams,
    OpenFolderDialogParams,
    RuntimeVersions,
    SaveFileDialogParams,
    UpdateCheckResult,
} from "../api-param-types";
import { Api, Endpoint } from "../api-types";

let idGen = 0;
const idGenMax = 2000000000;
const getId = () => {
    if (idGen >= idGenMax) {
        idGen = 0;
    }
    return ++idGen;
};

function executeOnce<T = any>(command: Endpoint, ...args: any[]): Promise<T> {
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
            (arg: any) => {
                if (arg instanceof Error) {
                    reject(arg);
                }
                resolve(arg);
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
}

export const api = new ApiCalls();
