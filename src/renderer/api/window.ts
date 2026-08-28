import { api } from "../../ipc/renderer/api";
import rendererEvents from "../../ipc/renderer/renderer-events";
import { TOneState } from "../core/state/state";
import { settings } from "./settings";
import type { IWindow } from "./types/window";

/**
 * Tell the main process this window has finished persisting its state and may
 * now be disposed of — the reply to the `eBeforeQuit` round-trip.
 *
 * The boolean carries the close-behavior policy with it, which is why this is a
 * function rather than a bare `api.setCanQuit(true)`. The main process cannot
 * read settings (it never loads `appSettings.json`), so rather than mirroring
 * the value over a second IPC channel and keeping it in sync per window, the
 * renderer answers with the decision already applied. There is no startup race
 * this way: whoever is closing has the current setting by definition.
 *
 * `false` means "hide me instead" — and main only honours that for the *last*
 * window, and never when the user picked Quit from the tray.
 */
export function signalReadyToQuit(): void {
    api.setCanQuit(!settings.get("window.close-to-tray"));
}

interface WindowState {
    isMaximized: boolean;
    zoomLevel: number;
    menuBarOpen: boolean;
    menuBarPanelId: string;
    mcpRunning: boolean;
    mcpClientCount: number;
}

export class Window implements IWindow {
    private _windowIndex: number | null = null;
    private _state = new TOneState<WindowState>({
        isMaximized: false,
        zoomLevel: 0,
        menuBarOpen: false,
        menuBarPanelId: "",
        mcpRunning: false,
        mcpClientCount: 0,
    });

    constructor() {
        this._initWindowIndex();
        this._initMcpStatus();
    }

    private async _initWindowIndex(): Promise<void> {
        this._windowIndex = await api.getWindowIndex();
    }

    private async _initMcpStatus(): Promise<void> {
        try {
            const status = await api.getMcpStatus();
            this._state.update(s => {
                s.mcpRunning = status.running;
                s.mcpClientCount = status.clientCount;
            });
        } catch { /* MCP may not be enabled */ }

        rendererEvents.eMcpStatusChanged.subscribe((status) => {
            this._state.update(s => {
                s.mcpRunning = status.running;
                s.mcpClientCount = status.clientCount;
            });
        });
    }

    // ── Window state setters ───────────────────────────────────────

    setMaximized(isMaximized: boolean): void {
        this._state.update(s => { s.isMaximized = isMaximized; });
    }

    setZoomLevel(zoomLevel: number): void {
        this._state.update(s => { s.zoomLevel = zoomLevel; });
    }

    // ── Window actions ─────────────────────────────────────────────

    minimize(): void {
        api.minimizeWindow();
    }

    maximize(): void {
        api.maximizeWindow();
    }

    restore(): void {
        api.restoreWindow();
    }

    close(): void {
        api.closeWindow();
    }

    toggleWindow(): void {
        if (this._state.get().isMaximized) {
            this.restore();
        } else {
            this.maximize();
        }
    }

    // ── Window state ───────────────────────────────────────────────

    get isMaximized(): boolean {
        return this._state.get().isMaximized;
    }

    // ── Menu bar ───────────────────────────────────────────────────

    get menuBarOpen(): boolean {
        return this._state.get().menuBarOpen;
    }

    toggleMenuBar(): void {
        this._state.update(s => { s.menuBarOpen = !s.menuBarOpen; });
    }

    openMenuBar(panelId?: string): void {
        this._state.update(s => {
            s.menuBarOpen = true;
            if (panelId) s.menuBarPanelId = panelId;
        });
    }

    /** Consume the pending menuBarPanelId (returns it and clears). */
    consumeMenuBarPanelId(): string {
        const id = this._state.get().menuBarPanelId;
        if (id) {
            this._state.update(s => { s.menuBarPanelId = ""; });
        }
        return id;
    }

    /** Subscribe to state changes (for sidebar reactivity). */
    get state() {
        return this._state;
    }

    // ── Zoom ───────────────────────────────────────────────────────

    zoom(delta: number): void {
        api.zoom(delta);
    }

    resetZoom(): void {
        api.resetZoom();
    }

    get zoomLevel(): number {
        return this._state.get().zoomLevel;
    }

    // ── Multi-window ───────────────────────────────────────────────

    async openNew(filePath?: string): Promise<number> {
        return api.openNewWindow(filePath);
    }

    // ── Window identity ────────────────────────────────────────────

    get windowIndex(): number {
        if (this._windowIndex === null) {
            throw new Error("Window not initialized yet");
        }
        return this._windowIndex;
    }
}

export const appWindow = new Window();
