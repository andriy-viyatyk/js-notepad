import { dialog } from "electron";
import {
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
} from "../api-param-types";

export async function showOpenFileDialog(
    browserWindow: Electron.BrowserWindow | undefined,
    params: OpenFileDialogParams
): Promise<string[] | undefined> {
    if (!browserWindow) return Promise.resolve(undefined);

    const result = await dialog.showOpenDialog(browserWindow, {
        title: params.title,
        defaultPath: params.defaultPath,
        filters: params.filters,
        properties: [
            "openFile",
            ...((params.multiSelections
                ? ["multiSelections"]
                : []) as Electron.OpenDialogOptions["properties"]),
        ],
    });

    if (result.canceled) {
        return undefined;
    }
    return result.filePaths;
}

export async function showSaveFileDialog(
    browserWindow: Electron.BrowserWindow | undefined,
    params: SaveFileDialogParams
): Promise<string | undefined> {
    if (!browserWindow) return Promise.resolve(undefined);
    const result = await dialog.showSaveDialog(browserWindow, {
        title: params.title,
        defaultPath: params.defaultPath,
        filters: params.filters,
    });
    if (result.canceled) {
        return undefined;
    }
    return result.filePath;
}

export async function showOpenFolderDialog(
    mainWindow: Electron.BrowserWindow | undefined,
    params: OpenFolderDialogParams
): Promise<string[] | undefined> {
    if (!mainWindow) return Promise.resolve(undefined);
    const result = await dialog.showOpenDialog(mainWindow, {
        title: params.title,
        defaultPath: params.defaultPath,
        properties: [
            "openDirectory",
            ...((params.multiSelections
                ? ["multiSelections"]
                : []) as Electron.OpenDialogOptions["properties"]),
        ],
    });
    if (result.canceled) {
        return undefined;
    }
    return result.filePaths;
}
