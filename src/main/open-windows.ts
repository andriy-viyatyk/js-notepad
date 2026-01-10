import path from "node:path";
import fs from "node:fs";
import { BrowserWindow } from "electron";
import { EventEndpoint } from "../ipc/api-types";
import { OpenWindow } from "./open-window";
import { windowStates } from "./window-states";
import { getDataFolder } from "./utils";
import { IPage, WindowPages } from "../shared/types";

interface OpenWindowData {
    window?: OpenWindow;
    index: number;
    whenReady?: Promise<void>;
    ready?: () => void;
}

const windowsFileName = "openWindows.json";

class OpenWindows {
    windows: OpenWindowData[] = [];
    doQuit = false;

    get mainWindow(): OpenWindow | undefined {
        return this.windows.find((w) => w.window)?.window;
    }

    send = (eventName: EventEndpoint, data: any) => {
        this.windows.forEach((win) => {
            win.window?.send(eventName, data);
        });
    };

    createWindow = (index?: number, dropPosition?: { x: number; y: number }): OpenWindowData => {
        const wIndex =
            index ?? Math.max(-1, ...this.windows.map((w) => w.index)) + 1;
        const newWindow = new OpenWindow(dropPosition);
        newWindow.index = wIndex;
        newWindow.onClose = this.windowOnClose;
        let windowData = this.windows.find((w) => w.index === index);
        if (!windowData) {
            windowData = { index: wIndex };
            this.windows.push(windowData);
        }
        windowData.window = newWindow;
        windowData.whenReady = new Promise<void>((resolve) => {
            windowData.ready = () => {
                resolve();
                windowData.ready = undefined;
            };
        });

        this.saveState();
        return windowData;
    };

    windowOnClose = (window: OpenWindow) => {
        let removeWindow = false;
        if (this.windows.length > 1) {
            const wState = windowStates.getState(window.index);
            if (!wState?.pages.some((p) => p.modified)) {
                removeWindow = true;
            }
        }

        if (removeWindow) {
            windowStates.deleteState(window.index);
            this.windows = this.windows.filter((w) => w.window !== window);
            this.saveState();
        } else {
            this.windows.forEach((w) => {
                if (w.window === window) {
                    w.window = undefined;
                }
            });
        }
    };

    findWindowDataByWindow = (
        openWindow: BrowserWindow
    ): OpenWindowData | undefined => {
        return this.windows.find((w) => w.window?.window === openWindow);
    };

    findByWindow = (browserWindow: BrowserWindow): OpenWindow | undefined => {
        return this.findWindowDataByWindow(browserWindow)?.window;
    };

    setCanQuit = (
        browserWindow: BrowserWindow | undefined,
        canQuit: boolean
    ) => {
        const openWindowData = this.findWindowDataByWindow(browserWindow);
        const openWindow = openWindowData?.window;
        const isLastWindow = !this.windows.some(w => w !== openWindowData && w.window);
        if (isLastWindow && !this.doQuit) {
            openWindow.window.hide();
            return;
        }
        if (openWindow) {
            openWindow.canQuit = canQuit;
            openWindow.close();
        }
    };

    handleOpenFile = (filePath: string) => {
        const mainWin = this.mainWindow;
        if (mainWin) {
            mainWin.send(EventEndpoint.eOpenFile, filePath);
            mainWin.focus();
        }
    };

    private saveState = (): void => {
        const state: OpenWindowData[] = this.windows.map((w) => ({
            index: w.index,
        }));
        const filePath = path.join(getDataFolder(), windowsFileName);
        fs.writeFileSync(filePath, JSON.stringify(state), {
            encoding: "utf-8",
        });
    };

    private loadState = (): OpenWindowData[] => {
        const filePath = path.join(getDataFolder(), windowsFileName);
        if (!fs.existsSync(filePath)) {
            return [];
        }
        try {
            const data = fs.readFileSync(filePath, { encoding: "utf-8" });
            return JSON.parse(data);
        } catch (e: any) {
            console.error("Failed to load open windows state:", e);
            return [];
        }
    };

    restoreState = (): void => {
        let windows = this.loadState();
        if (!Array.isArray(windows) || windows.some(w => !(typeof w.index === "number"))) {
            windows = [];
        }
        if (windows.length === 1 && windows[0].index !== 0) {
            windowStates.changeIndex(windows[0].index, 0);
            windows[0].index = 0;
        }
        this.windows = windows;
        this.createWindow(this.windows[0]?.index);
    };

    getWindowPages = (): WindowPages[] => {
        return this.windows.map((w) => {
            const wState = windowStates.getState(w.index);
            return {
                pages: wState?.pages || [],
                windowIndex: w.index,
            };
        });
    };

    showWindowPage = async (
        windowIndex: number,
        pageId: string
    ): Promise<void> => {
        const openWindowData = this.windows.find(
            (w) => w.index === windowIndex
        );

        if (!openWindowData) {
            return;
        }

        if (!openWindowData.window) {
            this.createWindow(windowIndex);
        } else {
            openWindowData.window.focus();
        }

        if (openWindowData.whenReady) {
            await openWindowData.whenReady;
            openWindowData.window?.send(EventEndpoint.eShowPage, pageId);
        }
    };

    movePageToWindow = async (
        sourceWindowIndex: number,
        targetWindowIndex: number | undefined,
        page: Partial<IPage>,
        targetPageId?: string,
        dropPosition?: { x: number; y: number },
    ): Promise<void> => {
        const sourceWindow = this.windows.find(
            (w) => w.index === sourceWindowIndex
        );
        if (!sourceWindow) { return;}

        sourceWindow.window?.send(EventEndpoint.eMovePageOut, page.id);

        let targetWindow = this.windows.find(
            (w) => w.index === targetWindowIndex
        );

        if (!targetWindow) {
            targetWindow = this.createWindow(targetWindowIndex, dropPosition);
        } else {
            targetWindow.window.focus();
        }

        if (targetWindow.whenReady) {
            await targetWindow.whenReady;
            targetWindow.window?.send(EventEndpoint.eMovePageIn, { page, targetPageId });
        }
    }

    openPathInNewWindow = async (filePath?: string): Promise<number> => {
        if (!filePath) { return; }

        const newWindow = this.createWindow();
        await newWindow.whenReady;
        newWindow.window?.send(EventEndpoint.eOpenFile, filePath);
        newWindow.window?.focus();
        return newWindow.index;
    }

    hideWindows = (): void => {
        this.windows.forEach((w) => {
            w.window?.window.hide();
        });
    }

    showWindows = (): void => {
        this.windows.forEach((w) => {
            w.window?.window.show();
        });
    }

    anyVisible = (): boolean => {
        return this.windows.some((w) => w.window?.window.isVisible());
    };

    makeVisible = (): void => {
        if (!this.anyVisible()) {
            const mainWin = this.mainWindow;
            if (mainWin) {
                mainWin.window.show();
            }
        }
    }
}

export const openWindows = new OpenWindows();
