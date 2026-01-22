import { BrowserWindow, screen, shell } from "electron";
import path from "node:path";

import { EventEndpoint } from "../ipc/api-types";
import { electronStore } from "./e-store";
import { getAssetPath } from "./utils";
import { appPartition } from "./constants";
import { debounce } from "../shared/utils";

interface WindowState {
    width: number;
    height: number;
    x?: number;
    y?: number;
}

export class OpenWindow {
    index = 0;
    window: BrowserWindow;
    customSession = null as Electron.Session | null;
    canQuit = false;
    onClose?: (window: OpenWindow) => void;

    constructor(position?: { x: number; y: number }) {
        let windowState: WindowState = electronStore.get("windowState", {
            width: 1024,
            height: 680,
            x: undefined as number | undefined,
            y: undefined as number | undefined,
        });

        if (position) {
            windowState.x = position.x - Math.floor(windowState.width / 2);
            windowState.y = position.y - 16;
        }

        windowState = this.ensureVisiblePosition(windowState);

        this.window = new BrowserWindow({
            show: false, // show after size fix on 'ready-to-show' event
            height: windowState.height,
            width: windowState.width,
            x: windowState.x,
            y: windowState.y,
            icon: getAssetPath("icon.png"),
            frame: false,
            webPreferences: {
                preload: path.join(__dirname, "preload.js"),
                partition: appPartition,
                nodeIntegration: true,
                contextIsolation: false,
                webSecurity: false,
                webviewTag: true,
                plugins: true,
                nodeIntegrationInSubFrames: true,
            },
        });

        this.window.once("ready-to-show", () => {
            this.window?.setSize(windowState.width, windowState.height);
            this.window?.show();
        });

        this.window.on("close", (event) => {
            if (!this.canQuit) {
                event.preventDefault();
                this.send(EventEndpoint.eBeforeQuit, undefined);
                return;
            }

            this.window = null;
            this.onClose?.(this);
        });

        this.window.on("maximize", () => {
            this.send(EventEndpoint.eWindowMaximized, true);
        });

        this.window.on("unmaximize", () => {
            this.send(EventEndpoint.eWindowMaximized, false);
        });

        this.window.on("resize", () => {
            this.saveWindowSize();
        });

        this.window.on("move", () => {
            this.saveWindowSize();
        });

        this.window.webContents.on("before-input-event", (event, input) => {
            if (!this.window) return;

            if (input.control || input.meta) {
                if (input.key === "+" || input.key === "=") {
                    event.preventDefault();
                    const currentZoom = this.window.webContents.getZoomLevel();
                    this.window.webContents.setZoomLevel(currentZoom + 0.5);
                } else if (input.key === "-") {
                    event.preventDefault();
                    const currentZoom = this.window.webContents.getZoomLevel();
                    this.window.webContents.setZoomLevel(currentZoom - 0.5);
                } else if (input.key === "0") {
                    event.preventDefault();
                    this.window.webContents.setZoomLevel(0);
                }
            }
        });

        this.window.webContents.on("zoom-changed", (event, zoomDirection) => {
            if (!this.window) return;

            const currentZoom = this.window.webContents.getZoomLevel();
            if (zoomDirection === "in") {
                this.window.webContents.setZoomLevel(currentZoom + 0.5);
            } else if (zoomDirection === "out") {
                this.window.webContents.setZoomLevel(currentZoom - 0.5);
            }
        });

        this.window.webContents.setWindowOpenHandler(({ url }) => {
            // todo: open in browser tab when implemented
            shell.openExternal(url);
            return { action: "deny" };
        });

        this.window.webContents.on("will-navigate", (event, url) => {
            console.log("Navigating to:", url);

            if (url.startsWith("http://localhost")) {
                const uri = new URL(url);
                if (uri.pathname === "/" || uri.pathname === "") {
                    return;
                }
                // todo: handle relative file to active page and open it
                event.preventDefault();
                return;
            }

            if (url.startsWith("file://")) {
                const uri = new URL(url);
                const currentUrl = this.window.webContents.getURL();
                
                // Allow initial load of your index.html
                if (!currentUrl || currentUrl === "about:blank") {
                    return;
                }
                
                // Check if this is the main app file
                const currentUri = new URL(currentUrl);
                if (uri.pathname === currentUri.pathname) {
                    return; // Allow same-page navigation (unlikely but safe)
                }
                
                event.preventDefault();
                return;
            }

            // Allow navigation within your app protocols
            if (
                url.startsWith("safe-file://") ||
                url.startsWith("app-asset://")
            ) {
                return;
            }

            // Block and open external links in browser
            event.preventDefault();
            shell.openExternal(url);
        });

        if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
            this.window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
        } else {
            this.window.loadFile(
                path.join(
                    __dirname,
                    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`
                )
            );
        }

        // this.window.webContents.openDevTools();
    }

    send(eventName: EventEndpoint, data: any) {
        if (!this.window) {
            return;
        }
        this.window.webContents.send(eventName, data);
    }

    focus = () => {
        if (this.window) {
            if (this.window.isMinimized()) {
                this.window.restore();
            }
            this.window.focus();
        }
    };

    close = () => {
        this.canQuit = true;
        this.window?.close();
        this.window = null;
        this.onClose?.(this);
    };

    saveWindowSize = debounce(() => {
        if (this.window && !this.window?.isMaximized()) {
            const bounds = this.window?.getBounds();
            if (bounds) {
                electronStore.set("windowState", {
                    width: bounds.width,
                    height: bounds.height,
                    x: bounds.x,
                    y: bounds.y,
                });
            }
        }
    }, 500);

    ensureVisiblePosition = (bounds: WindowState): WindowState => {
        if (bounds.x === undefined || bounds.y === undefined) {
            return bounds;
        }

        const displays = screen.getAllDisplays();
        const headerHeight = 40; // Adjust this to match your actual header height
        const minVisibleArea = 100; // Minimum pixels that should be visible horizontally

        // Find which display the window is on (based on center point)
        const centerX = bounds.x + Math.floor(bounds.width / 2);
        const centerY = bounds.y + Math.floor(bounds.height / 2);

        let targetDisplay = displays.find((display) => {
            const { x, y, width, height } = display.bounds;
            return (
                centerX >= x &&
                centerX < x + width &&
                centerY >= y &&
                centerY < y + height
            );
        });

        // If center is not on any display, use primary display
        if (!targetDisplay) {
            targetDisplay = screen.getPrimaryDisplay();
        }

        const {
            x: displayX,
            y: displayY,
            width: displayWidth,
            height: displayHeight,
        } = targetDisplay.workArea;

        let newX = bounds.x;
        let newY = bounds.y;

        // Ensure header is visible (top of window must be below top of work area)
        if (newY < displayY) {
            newY = displayY;
        }

        // Ensure header doesn't go below the bottom of the screen
        if (newY + headerHeight > displayY + displayHeight) {
            newY = displayY + displayHeight - headerHeight;
        }

        // Ensure enough of the window is visible horizontally (left side)
        if (newX + minVisibleArea > displayX + displayWidth) {
            newX = displayX + displayWidth - minVisibleArea;
        }

        // Ensure enough of the window is visible horizontally (right side)
        if (newX + bounds.width < displayX + minVisibleArea) {
            newX = displayX + minVisibleArea - bounds.width;
        }

        // If window is too large for the display, center it
        if (bounds.width > displayWidth || bounds.height > displayHeight) {
            return {
                x: displayX + Math.floor((displayWidth - bounds.width) / 2),
                y: displayY + Math.floor((displayHeight - bounds.height) / 2),
                width: bounds.width,
                height: bounds.height,
            };
        }

        return {
            x: newX,
            y: newY,
            width: bounds.width,
            height: bounds.height,
        };
    };
}
