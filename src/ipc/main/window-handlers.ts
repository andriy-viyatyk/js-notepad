import { BrowserWindow } from "electron";
import { openWindows } from "../../main/open-windows";
import { isValidFilePath } from "../../main/utils";


let argFile: string | undefined = process.argv[1]; // process.argv[1]; "D:\\temp\\interactive-script-js-README.md";

if (!isValidFilePath(argFile)) {
    argFile = undefined;
}

export async function windowReady(window: BrowserWindow): Promise<void> {
    const openWindow = openWindows.findWindowDataByWindow(window);
    openWindow?.ready?.();
    return;
}

export async function getFileToOpen(): Promise<string | undefined> {
    const path = argFile;
    argFile = undefined;
    if (path && isValidFilePath(path)) {
        return path;
    }
    return undefined;
}
