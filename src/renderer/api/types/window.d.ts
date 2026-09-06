/**
 * Window management API.
 *
 * Controls the application window: minimize, maximize, restore, close,
 * zoom, menu bar, and multi-window support.
 *
 * @example
 * app.window.maximize();
 * console.log(app.window.isMaximized);
 * app.window.zoom(1);  // zoom in
 * await app.window.openNew("C:/file.txt");
 */
import type {
    IBrowserElementLocator,
    IBrowserNetworkRequest,
    IBrowserScreenshot,
} from "./browser-editor";

export interface IMenuBarFolder {
    /** Current folder identifier; use this value with `window.menuBar.open()`. */
    readonly id: string;
    /** Display name shown in the Menu Bar. */
    readonly label: string;
    /** Whether this is a built-in category or a configured user folder. */
    readonly kind: "builtin" | "user";
    /** Disk path for a path-backed user folder; absent for built-ins and virtual folders. */
    readonly path?: string;
}

/**
 * The live Menu Bar sidebar model.
 *
 * Built-in folder IDs are `open-tabs`, `recent-files`, `tools-editors`, and `script-library`.
 * Configured user-folder IDs are live and are listed by `folders`.
 */
export interface IMenuBar {
    /**
     * Whether the Menu Bar is open. The backdrop remains in the DOM while closed and is CSS-hidden,
     * so use this property rather than element presence to determine openness.
     */
    readonly isOpen: boolean;
    /** Current built-in and configured user-folder records. */
    readonly folders: readonly IMenuBarFolder[];
    /** The currently selected live folder record. */
    readonly selected: IMenuBarFolder;
    /**
     * Open the Menu Bar, optionally selecting a folder by its ID (not its display label or path).
     * Omit the argument to open without changing selection.
     */
    open(folderId?: string): void;
    /** Close the Menu Bar; calling this when already closed is safe. */
    close(): void;
}

/**
 * Automation host for Persephone's own application window and its active page.
 * Page opening and switching belongs to `app.pages` and `app.pages.showPage(...)`;
 * this host intentionally has no browser navigation or tab operations.
 */
export interface IWindowScreen {
    /** Build the complete current app-window accessibility snapshot. */
    snapshot(options?: { tabId?: string }): Promise<string>;
    /** Click an app-window element by CSS selector or explicit snapshot ref. */
    click(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;
    /** Hover an app-window element by CSS selector or explicit snapshot ref. */
    hover(locator: IBrowserElementLocator, options?: { tabId?: string }): Promise<void>;
    /** Type into an app-window input, clearing its existing value first. */
    type(locator: IBrowserElementLocator, text: string, options?: { tabId?: string; slowly?: boolean; submit?: boolean }): Promise<void>;
    /** Select an app-window option by value. */
    select(locator: IBrowserElementLocator, values: string | string[], options?: { tabId?: string }): Promise<void>;
    /** Press a key or compound key in the app window. */
    pressKey(key: string, options?: { tabId?: string }): Promise<void>;
    /** Run JavaScript in the app window and return the result. */
    evaluate(expression: string, options?: { tabId?: string }): Promise<unknown>;
    /** Wait for exactly one selector, text, textGone, or time condition. */
    waitFor(options: {
        selector?: string;
        text?: string;
        textGone?: string;
        time?: number;
        timeout?: number;
        tabId?: string;
    }): Promise<void>;
    /** Capture the app window as a PNG; unavailable sessions return undefined. */
    screenshot(options?: { tabId?: string }): Promise<IBrowserScreenshot | undefined>;
    /** Get recorded network requests for the app-window target. */
    networkRequests(options?: { tabId?: string }): Promise<IBrowserNetworkRequest[]>;
}

export interface IWindow {
    // ── Window actions ───────────────────────────────────────────────

    /** Minimize the window to the taskbar. */
    minimize(): void;

    /** Maximize the window. */
    maximize(): void;

    /** Restore the window from maximized/minimized state. */
    restore(): void;

    /** Close the window. */
    close(): void;

    /** Toggle between maximized and restored state. */
    toggleWindow(): void;

    // ── Window state ─────────────────────────────────────────────────

    /** Whether the window is currently maximized. Updated reactively. */
    readonly isMaximized: boolean;

    // ── Menu bar ─────────────────────────────────────────────────────

    /** Whether the menu bar (sidebar) is currently open. */
    readonly menuBarOpen: boolean;

    /** The live Menu Bar model, including folder discovery, selection, and controls. */
    readonly menuBar: IMenuBar;

    /**
     * Persephone's own window automation host. Open and switch pages through `pages` and
     * `pages.showPage(...)`, not browser navigation or tab methods.
     */
    readonly screen: IWindowScreen;

    /** Toggle the menu bar (sidebar) open/closed. */
    toggleMenuBar(): void;

    /** Open the sidebar, optionally selecting a panel by ID; unknown strings remain lenient. */
    openMenuBar(panelId?: string): void;

    // ── Zoom ─────────────────────────────────────────────────────────

    /**
     * Zoom in or out.
     * @param delta Positive to zoom in, negative to zoom out (e.g., 1 or -1).
     */
    zoom(delta: number): void;

    /** Reset zoom to 100%. */
    resetZoom(): void;

    /** Current zoom level (step value). 0 = 100%. Updated reactively. */
    readonly zoomLevel: number;

    // ── Multi-window ─────────────────────────────────────────────────

    /**
     * Open a new application window.
     * @param filePath Optional file to open in the new window.
     * @returns The new window's index.
     */
    openNew(filePath?: string): Promise<number>;

    // ── Window identity ───────────────────────────────────────────

    /** Zero-based index of this window among all application windows. */
    readonly windowIndex: number;
}
