import { BrowserWindow, ipcMain } from "electron";
import { openWindows } from "../../main/open-windows";
import { EventEndpoint, RendererEvent } from "../api-types";

export const initRendererEvents = () => {
    ipcMain.on(RendererEvent.fileDropped, (event, filePath: string) => {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (senderWindow) {
            const openWindow = openWindows.findByWindow(senderWindow);
            if (openWindow) {
                openWindow.send(EventEndpoint.eOpenFile, filePath);
            }
        }
    });
};
