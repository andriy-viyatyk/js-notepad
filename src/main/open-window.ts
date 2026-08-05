import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
    quitTimeout: ReturnType<typeof setTimeout> | null = null;
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
                nodeIntegrationInSubFrames: false,
                spellcheck: false,
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
                // If renderer is crashed or unresponsive, force-quit after timeout
                if (!this.quitTimeout) {
                    this.quitTimeout = setTimeout(() => {
                        this.close();
                    }, 2000);
                }
                return;
            }

            if (this.quitTimeout) {
                clearTimeout(this.quitTimeout);
                this.quitTimeout = null;
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
                    this.send(EventEndpoint.eZoomChanged, currentZoom + 0.5);
                } else if (input.key === "-") {
                    event.preventDefault();
                    const currentZoom = this.window.webContents.getZoomLevel();
                    this.window.webContents.setZoomLevel(currentZoom - 0.5);
                    this.send(EventEndpoint.eZoomChanged, currentZoom - 0.5);
                } else if (input.key === "0") {
                    event.preventDefault();
                    this.window.webContents.setZoomLevel(0);
                    this.send(EventEndpoint.eZoomChanged, 0);
                }
            }
        });

        this.window.webContents.setWindowOpenHandler(({ url }) => {
            this.send(EventEndpoint.eOpenUrl, url);
            return { action: "deny" };
        });

        this.window.webContents.on("will-navigate", (event, url) => {
            console.log("Navigating to:", url);

            if (url.startsWith("http://localhost") || url.startsWith("http://127.0.0.1")) {
                // Allow only the Vite dev server's own initial load (dev mode).
                // Any other http://localhost:<port> link is an external app —
                // route it through eOpenUrl so it doesn't replace the Persephone UI.
                if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
                    const uri = new URL(url);
                    const devUri = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
                    if (
                        uri.origin === devUri.origin &&
                        (uri.pathname === "/" || uri.pathname === "")
                    ) {
                        return;
                    }
                }
                event.preventDefault();
                this.send(EventEndpoint.eOpenUrl, url);
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

                const filePath = fileURLToPath(url);
                this.send(EventEndpoint.eOpenFile, filePath);
                return;
            }

            // Allow navigation within your app protocols
            if (url.startsWith("app-asset://")) {
                return;
            }

            // Block and send to renderer for routing
            event.preventDefault();
            this.send(EventEndpoint.eOpenUrl, url);
        });

        // US-884: `will-navigate` above covers only the MAIN frame. A board renders in an
        // out-of-process subframe on a `board://<host>` origin; a stray link inside it (e.g.
        // an <a href="http://…"> in a rendered .docx) navigates the FRAME away from board://,
        // which can't load http — the frame goes blank (white screen). Subframe navigations
        // fire `will-frame-navigate`, not `will-navigate`, so guard them here: never let a
        // board frame leave its own origin, and route the intended URL through the normal
        // openRawLink pipeline (eOpenUrl → RendererEventsService.handleOpenUrl) so the click
        // still opens the link in a Persephone page / browser instead of dying silently.
        this.window.webContents.on("will-frame-navigate", (details) => {
            // The main frame is already handled by `will-navigate` above.
            if (details.isMainFrame) return;

            // Only guard frames that currently live on a board:// origin — other subframes
            // (dev iframes, etc.) keep their default behavior. `frame` may be null if the
            // frame was destroyed mid-navigation.
            const currentUrl = details.frame?.url ?? "";
            if (!currentUrl.startsWith("board://")) return;

            // Same-origin in-board navigation (board://<host>/other.html) is a legitimate,
            // supported path (BoardWebview re-handshakes on each load) — allow it. Anything
            // that leaves the board's origin would blank the frame → block + route.
            let currentOrigin = "";
            let targetOrigin = "";
            try {
                currentOrigin = new URL(currentUrl).origin;
                targetOrigin = new URL(details.url).origin;
            } catch {
                // Unparseable target → treat as external and block below.
            }
            if (targetOrigin && targetOrigin === currentOrigin) return;

            details.preventDefault();
            this.send(EventEndpoint.eOpenUrl, details.url);
        });

        if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
            this.window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
        } else {
            this.window.loadFile(
                path.join(
                    __dirname,
                    `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
                ),
            );
        }

        // this.window.webContents.openDevTools();
    }

    send(eventName: EventEndpoint, data: unknown) {
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
            // Re-check position against current display layout (display may have
            // changed since window was last shown, e.g. VM disconnect, dock/undock)
            const currentBounds = this.window.getBounds();
            const fixed = this.ensureVisiblePosition(currentBounds);
            if (
                fixed.x !== currentBounds.x || fixed.y !== currentBounds.y ||
                fixed.width !== currentBounds.width || fixed.height !== currentBounds.height
            ) {
                this.window.setBounds(fixed);
            }
            this.window.focus();
        }
    };

    close = () => {
        const win = this.window;
        this.window = null;
        this.onClose?.(this);
        if (win) {
            win.destroy();
        }
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
        const headerHeight = 40;
        const minVisibleArea = 100;

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
        let newWidth = bounds.width;
        let newHeight = bounds.height;

        // If window is too large for the display, shrink it to fit
        if (newWidth > displayWidth) {
            newWidth = displayWidth;
            newX = displayX;
        }
        if (newHeight > displayHeight) {
            newHeight = displayHeight;
            newY = displayY;
        }

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
        if (newX + newWidth < displayX + minVisibleArea) {
            newX = displayX + minVisibleArea - newWidth;
        }

        return {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight,
        };
    };
}
