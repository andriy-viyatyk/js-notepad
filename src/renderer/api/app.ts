import { api } from "../../ipc/renderer/api";
import ipcRendererEvents from "../../ipc/renderer/renderer-events";
import type { ISettings } from "./types/settings";
import type { IEditorRegistry } from "./types/editors";
import type { IRecentFiles } from "./types/recent";
import type { IFileSystem } from "./types/fs";
import type { Window } from "./window";
import type { IShell } from "./types/shell";
import type { IUserInterface } from "./types/ui";
import type { IDownloads } from "./types/downloads";
import type { IMenuFolders } from "./types/menu-folders";
import type { PagesModel } from "./pages/PagesModel";
import { AppEvents } from "./events/AppEvents";
import type { IFetchOptions } from "./types/app";

// Note: IApp (.d.ts) is the script-facing interface for Monaco IntelliSense.
// App class has additional internal methods (init, initServices, initPages, initEvents)
// and uses rich internal types (PagesModel instead of IPageCollection).
class App {
    private _version = "";
    private _initialized = false;
    private _setupInitialized = false;
    private _servicesInitialized = false;
    private _pagesInitialized = false;
    private _eventsInitialized = false;

    // Initialized by initServices() after main bundle loads.
    // Getters are safe: scripts only run after bootstrap completes.
    private _settings = undefined as unknown as ISettings;
    private _editors = undefined as unknown as IEditorRegistry;
    private _recent = undefined as unknown as IRecentFiles;
    private _fs = undefined as unknown as IFileSystem;
    private _window = undefined as unknown as Window;
    private _shell = undefined as unknown as IShell;
    private _ui = undefined as unknown as IUserInterface;
    private _downloads = undefined as unknown as IDownloads;
    private _menuFolders = undefined as unknown as IMenuFolders;
    private _pages = undefined as unknown as PagesModel;
    private _events = new AppEvents();

    get version(): string {
        return this._version;
    }

    get settings(): ISettings {
        return this._settings;
    }

    get editors(): IEditorRegistry {
        return this._editors;
    }

    get recent(): IRecentFiles {
        return this._recent;
    }

    get fs(): IFileSystem {
        return this._fs;
    }

    get window(): Window {
        return this._window;
    }

    get shell(): IShell {
        return this._shell;
    }

    get ui(): IUserInterface {
        return this._ui;
    }

    get downloads(): IDownloads {
        return this._downloads;
    }

    get menuFolders(): IMenuFolders {
        return this._menuFolders;
    }

    get pages(): PagesModel {
        return this._pages;
    }

    get events(): AppEvents {
        return this._events;
    }

    fetch = async (url: string, options?: IFetchOptions): Promise<Response> => {
        const { nodeFetch } = await import("./node-fetch");
        return nodeFetch(url, options);
    };

    /**
     * Initialize version. Called early in bootstrap (renderer.tsx).
     * Not exposed to scripts.
     */
    async init(): Promise<void> {
        if (this._initialized) return;
        this._initialized = true;

        this._version = await api.getAppVersion();
    }

    /**
     * Configure Monaco editor (themes, languages, keybindings, type definitions).
     * Called early in bootstrap before services or editors load.
     * Not exposed to scripts.
     */
    async initSetup(): Promise<void> {
        if (this._setupInitialized) return;
        this._setupInitialized = true;

        const { initMonaco } = await import("./setup/configure-monaco");
        await initMonaco();
    }

    /**
     * Load interface wrappers via dynamic import().
     * Must be called AFTER the main bundle has loaded (so stores are in the
     * module cache). Called from bootstrap (renderer.tsx) before React renders.
     * Not exposed to scripts.
     */
    async initServices(): Promise<void> {
        if (this._servicesInitialized) return;
        this._servicesInitialized = true;

        const [{ settings }, { editors }, { recent }, { fs }, win, { shell }, { ui }, { downloads }, { menuFolders }] = await Promise.all([
            import("./settings"),
            import("./editors"),
            import("./recent"),
            import("./fs"),
            import("./window"),
            import("./shell"),
            import("./ui"),
            import("./downloads"),
            import("./menu-folders"),
        ]);
        this._settings = settings;
        this._editors = editors;
        this._recent = recent;
        this._fs = fs;
        this._window = win.appWindow;
        this._shell = shell;
        this._ui = ui;
        this._downloads = downloads;
        this._menuFolders = menuFolders;

        // Initialize downloads tracking
        await this._downloads.init();
    }

    /**
     * Initialize pages. Called in bootstrap (renderer.tsx) after initServices().
     * Ensures filesystem is ready, then restores persisted pages and handles CLI arguments.
     * Not exposed to scripts.
     */
    async initPages(): Promise<void> {
        if (this._pagesInitialized) return;
        this._pagesInitialized = true;

        // Ensure filesystem paths are initialized before restoring pages.
        // Previously, a 100ms setTimeout in fs.ts worked around this race condition.
        // With explicit bootstrap, we properly await readiness.
        const { fs: appFs } = await import("./fs");
        await appFs.wait();

        const { pages } = await import("./pages");
        this._pages = pages;

        await pages.init();
    }

    /**
     * Initialize event handlers. Called in bootstrap (renderer.tsx) after initPages().
     * Subscribes to global events, keyboard shortcuts, IPC events, etc.
     * Not exposed to scripts.
     */
    async initEvents(): Promise<void> {
        if (this._eventsInitialized) return;
        this._eventsInitialized = true;

        // Register link pipeline handlers first — they're the fallback handlers
        // (oldest in LIFO, run last). Scripts subscribe later and run first.
        // Registration order: opener first (runs last in LIFO), then resolvers, then parsers.
        const { registerOpenHandler } = await import("../content/open-handler");
        const { registerResolvers } = await import("../content/resolvers");
        const { registerRawLinkParsers } = await import("../content/parsers");
        const { registerTreeContextMenuHandlers } = await import("../content/tree-context-menus");
        registerOpenHandler();
        registerResolvers();
        registerRawLinkParsers();
        registerTreeContextMenuHandlers();

        // Import and initialize all event services
        const [
            { GlobalEventService },
            { KeyboardService },
            { WindowStateService },
            { RendererEventsService },
            { initMcpHandler },
        ] = await Promise.all([
            import("./internal/GlobalEventService"),
            import("./internal/KeyboardService"),
            import("./internal/WindowStateService"),
            import("./internal/RendererEventsService"),
            import("./mcp-handler"),
        ]);

        // Create service instances
        const globalEvents = new GlobalEventService();
        const keyboard = new KeyboardService();
        const windowState = new WindowStateService();
        const rendererEvents = new RendererEventsService();

        // Initialize all services in parallel
        await Promise.all([
            globalEvents.init(),
            keyboard.init(),
            windowState.init(),
            rendererEvents.init(),
        ]);

        // Initialize MCP command handler (listens for IPC from main process)
        initMcpHandler();

        // Ensure settings are loaded from disk before checking mcp.enabled
        const { settings: settingsInstance } = await import("./settings");
        await settingsInstance.wait();

        // Defer MCP auto-start and autoload scripts to not block window rendering
        setTimeout(async () => {
            if (this._settings.get("mcp.enabled")) {
                const port = this._settings.get("mcp.port") as number | undefined;
                api.setMcpEnabled(true, port || undefined);
            }
            const browserToolsEnabled = this._settings.get("mcp.browser-tools.enabled");
            api.setBrowserToolsEnabled(!!browserToolsEnabled);

            // Auto-start Mneme if enabled. Toast only on failure here (success on every
            // launch would be noisy); user-initiated toggles toast success below.
            if (this._settings.get("mneme.enabled")) {
                const mnemePort = this._settings.get("mneme.port") as number | undefined;
                api.setMnemeEnabled(true, mnemePort || undefined).then((status) => {
                    if (!status.running) {
                        this._ui.notify(`Mneme failed to start: ${status.error ?? "unknown error"}`, "error");
                    }
                });
            }

            // Initialize the shared Mneme health model that drives the header
            // indicator (and is read by the Mneme config editor).
            try {
                const { mnemeStatusModel } = await import("./mneme-status");
                mnemeStatusModel.init();
                const { mnemeConnection } = await import("./mneme-connection");
                mnemeConnection.init();
            } catch (error) {
                console.error("Mneme status model init failed:", error);
            }

            // Load autoload scripts from Script Library
            try {
                const { autoloadService } = await import("./autoload-service");
                await autoloadService.loadScripts();
            } catch (error) {
                console.error("Autoload scripts failed:", error);
            }
        }, 1500);

        // Watch for mcp.enabled setting changes
        this._settings.onChanged.subscribe(({ key, value }) => {
            if (key === "mcp.enabled") {
                const port = this._settings.get("mcp.port") as number | undefined;
                api.setMcpEnabled(!!value, port || undefined);
            }
            if (key === "mcp.browser-tools.enabled") {
                api.setBrowserToolsEnabled(value !== false);
            }
            if (key === "mneme.enabled") {
                const mnemePort = this._settings.get("mneme.port") as number | undefined;
                api.setMnemeEnabled(!!value, mnemePort || undefined).then((status) => {
                    if (!value) return; // silent on intentional stop
                    if (status.running) {
                        this._ui.notify("Mneme started", "success");
                    } else {
                        this._ui.notify(`Mneme failed to start: ${status.error ?? "unknown error"}`, "error");
                    }
                });
            }
        });

        // Toast unexpected Mneme exits (crash after a successful start).
        ipcRendererEvents.eMnemeStatusChanged.subscribe((s) => {
            if (s.error) {
                this._ui.notify(`Mneme: ${s.error}`, "error");
            }
        });
    }
}

/**
 * The root application object.
 * Available in scripts as the global `app` variable.
 */
export const app = new App();
