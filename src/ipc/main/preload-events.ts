import { BrowserWindow, ipcMain } from "electron";
import { openWindows } from "../../main/open-windows";
import { EventEndpoint, PreloadEvent } from "../api-types";

export const initPreloadEvents = () => {
    ipcMain.on(PreloadEvent.fileDropped, (event, filePath: string) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (senderWindow) {
            const openWindow = openWindows.findByWindow(senderWindow);
            if (openWindow) {
                openWindow.send(EventEndpoint.eOpenFile, filePath);
            }
        }
    });
};
