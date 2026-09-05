import { dialog } from "electron";
import {
    OpenFileDialogParams,
    OpenFolderDialogParams,
    SaveFileDialogParams,
} from "../api-param-types";
import { rememberDirFromPick, resolveDefaultPath } from "../../main/dialog-folder-memory";
import { withNativeDialog } from "../../main/native-dialog-tracker";

export async function showOpenFileDialog(
    browserWindow: Electron.BrowserWindow | undefined,
    params: OpenFileDialogParams
): Promise<string[] | undefined> {
    if (!browserWindow) return Promise.resolve(undefined);

    const result = await withNativeDialog(browserWindow, "file", () => dialog.showOpenDialog(browserWindow, {
        title: params.title,
        defaultPath: resolveDefaultPath({
            kind: "open",
            defaultPath: params.defaultPath,
            location: params.location,
        }),
        filters: params.filters,
        properties: [
            "openFile",
            ...((params.multiSelections
                ? ["multiSelections"]
                : []) as Electron.OpenDialogOptions["properties"]),
        ],
    }));

    if (result.canceled) {
        return undefined;
    }
    if (result.filePaths[0]) rememberDirFromPick("open", result.filePaths[0]);
    return result.filePaths;
}

export async function showSaveFileDialog(
    browserWindow: Electron.BrowserWindow | undefined,
    params: SaveFileDialogParams
): Promise<string | undefined> {
    if (!browserWindow) return Promise.resolve(undefined);
    const result = await withNativeDialog(browserWindow, "file", () => dialog.showSaveDialog(browserWindow, {
        title: params.title,
        defaultPath: resolveDefaultPath({
            kind: "save",
            defaultPath: params.defaultPath,
            location: params.location,
        }),
        filters: params.filters,
    }));
    if (result.canceled) {
        return undefined;
    }
    if (result.filePath) rememberDirFromPick("save", result.filePath);
    return result.filePath;
}

export async function showOpenFolderDialog(
    mainWindow: Electron.BrowserWindow | undefined,
    params: OpenFolderDialogParams
): Promise<string[] | undefined> {
    if (!mainWindow) return Promise.resolve(undefined);
    const result = await withNativeDialog(mainWindow, "folder", () => dialog.showOpenDialog(mainWindow, {
        title: params.title,
        defaultPath: resolveDefaultPath({
            kind: "folder",
            defaultPath: params.defaultPath,
            location: params.location,
        }),
        properties: [
            "openDirectory",
            ...((params.multiSelections
                ? ["multiSelections"]
                : []) as Electron.OpenDialogOptions["properties"]),
        ],
    }));
    if (result.canceled) {
        return undefined;
    }
    if (result.filePaths[0]) rememberDirFromPick("folder", result.filePaths[0]);
    return result.filePaths;
}
