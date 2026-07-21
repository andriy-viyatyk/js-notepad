import { debounce } from "../../shared/utils";
import { TGlobalState } from "../core/state/state";
import { Subscription } from "../core/state/events";
import { parseJSON5 } from "../core/utils/parse-utils";
import { fs } from "./fs";
import { FileWatcher } from "../core/utils/file-watcher";
import { applyTheme } from "../theme/themes";
import { defaultSearchableExtensions, defaultMaxFileSize } from "../../ipc/search-ipc";
import { wrapSubscription } from "./internal";
import type { ISettings } from "./types/settings";

// =============================================================================
// Types
// =============================================================================

export interface BrowserProfile {
    name: string;
    color: string;
    bookmarksFile?: string;
}

export type AppSettingsKey =
    | "tab-recent-languages"
    | "theme"
    | "search-extensions"
    | "search-max-file-size"
    | "browser-profiles"
    | "browser-default-profile"
    | "browser-default-bookmarks-file"
    | "browser-incognito-bookmarks-file"
    | "link-open-behavior"
    | "mcp.enabled"
    | "mcp.port"
    | "mcp.browser-tools.enabled"
    | "mneme.enabled"
    | "mneme.port"
    | "script-library.path"
    | "drawing.library-path"
    | "pinned-editors"
    | "tor.exe-path"
    | "tor.socks-port"
    | "tor.bookmarks-file"
    | "vlc-path"
    | "terminal.command"
    | "video-stream.port"
    | "visualizer-effect"
    | "audio-shuffle"
    | "git.enabled"
    | "board-vars.file";

// =============================================================================
// State
// =============================================================================

const settingsFileName = "appSettings.json";

const settingsComments: Partial<Record<AppSettingsKey, string>> = {
    "tab-recent-languages":
        "Recently selected languages.\nMore recent languages will appear on top of 'change language' menu.",
    "theme": "Application color theme.\nAvailable themes: default-dark, solarized-dark, monokai, abyss, red, tomorrow-night-blue, light-modern, solarized-light, quiet-light",
    "search-extensions": "File extensions to include in file content search.\nAdd or remove extensions to customize which files are searchable.",
    "search-max-file-size": "Maximum file size (in bytes) for file content search.\nFiles larger than this are skipped. Default: 1048576 (1 MB).",
    "browser-profiles": "Browser profiles for isolated browsing sessions.\nEach profile has its own cookies, storage, and cache.",
    "browser-default-profile": "Default browser profile name used when opening a new browser tab.\nEmpty string means the built-in default profile.",
    "browser-default-bookmarks-file": "Path to the .link.json bookmarks file for the default browser profile.",
    "browser-incognito-bookmarks-file": "Path to the .link.json bookmarks file for incognito mode.",
    "link-open-behavior": "How external links open from editors.\n\"default-browser\" opens in the OS default browser, \"internal-browser\" opens in the nearest Browser tab.",
    "mcp.enabled": "Enable MCP (Model Context Protocol) HTTP server.\nAllows AI agents like Claude Desktop and Claude Code to control persephone.",
    "mcp.port": "Port number for the MCP HTTP server.\nDefault: 7865. Change requires toggling MCP off and on.",
    "mcp.browser-tools.enabled": "Allow AI agents to control the built-in browser.\nWhen enabled, browser_* MCP tools are available (reconnect agent to apply changes).",
    "mneme.enabled": "Enable the Mneme knowledge-base service.\nPersephone launches mneme.exe as a local sidecar and connects over loopback HTTP.",
    "mneme.port": "Port number for the Mneme HTTP (MCP) server.\nDefault: 7700. Change requires toggling Mneme off and on.",
    "script-library.path": "Path to the script library folder.\nA folder on disk where saved scripts and reusable modules are stored.",
    "drawing.library-path": "Path to Excalidraw library folder.\nStores reusable shapes and components for the drawing editor.",
    "pinned-editors": "Pinned editors shown in the '+' new-page menu.\nArray of creatable item IDs. Reorder to change menu order.",
    "tor.exe-path": "Path to tor.exe. Required for Browser (Tor) mode.\nDownload the Tor Expert Bundle or find tor.exe in your Tor Browser installation folder.",
    "tor.socks-port": "SOCKS proxy port for Tor.\nDefault: 9050. Change if port 9050 is already in use.",
    "tor.bookmarks-file": "Path to the .link.json bookmarks file for Browser (Tor) mode.",
    "vlc-path": "Path to VLC executable.\nLeave empty to auto-detect C:\\Program Files\\VideoLAN\\VLC\\vlc.exe.",
    "terminal.command": "Terminal launched by \"Open Terminal here\".\nCommand or path — pwsh, powershell, cmd, or wt. Leave empty to auto-detect (pwsh -> powershell -> cmd) on first use.",
    "video-stream.port": "Port for the local video streaming server.\nUsed by the video player for VLC integration and proxied HTTP sources. Default: 7866.",
    "visualizer-effect": "Audio visualizer effect type.\nAvailable: bars, circular.",
    "audio-shuffle": "Whether shuffle mode is enabled for audio playback.",
    "git.enabled": "Enable Git integration (Git Tree + File Diff editors).\nOff by default. Requires git installed and on PATH.",
    "board-vars.file": "Path to the board environment-variables file (.env.json).\nStores per-board variables/secrets outside board folders. May be encrypted with a password via the file's encryption menu.",
};

const defaultAppSettingsState = {
    settings: {
        "tab-recent-languages": ["plaintext"] as string[],
        "theme": "default-dark",
        "search-extensions": defaultSearchableExtensions as string[],
        "search-max-file-size": defaultMaxFileSize,
        "browser-profiles": [] as BrowserProfile[],
        "browser-default-profile": "",
        "browser-default-bookmarks-file": "",
        "browser-incognito-bookmarks-file": "",
        "link-open-behavior": "default-browser" as "default-browser" | "internal-browser",
        "mcp.enabled": false,
        "mcp.port": 7865,
        "mcp.browser-tools.enabled": false,
        "mneme.enabled": false,
        "mneme.port": 7700,
        "script-library.path": "",
        "drawing.library-path": "",
        "pinned-editors": ["script-js", "script-ts", "draw-view", "grid-json", "grid-csv", "browser"] as string[],
        "tor.exe-path": "",
        "tor.socks-port": 9050,
        "tor.bookmarks-file": "",
        "vlc-path": "",
        "terminal.command": "",
        "video-stream.port": 7866,
        "visualizer-effect": "bars" as string,
        "audio-shuffle": false,
        "git.enabled": false,
        "board-vars.file": "",
    },
};

type AppSettingsState = typeof defaultAppSettingsState;

// =============================================================================
// Implementation
// =============================================================================

class Settings implements ISettings {
    readonly onChanged;

    private readonly state = new TGlobalState(defaultAppSettingsState);
    private readonly _initPromise: Promise<void>;
    private fileWatcher: FileWatcher | undefined;
    private skipNextFileChange = false;

    constructor() {
        this.onChanged = wrapSubscription(this._onChanged);
        this._initPromise = this.init();
    }

    /** Wait until settings are loaded from disk. */
    wait = async (): Promise<void> => {
        await this._initPromise;
    };

    get theme(): string {
        return this.state.get().settings["theme"];
    }

    get<K extends AppSettingsKey>(key: K): AppSettingsState["settings"][K];
    get<T = unknown>(key: string): T;
    get(key: string) {
        return this.state.get().settings[key as AppSettingsKey];
    }

    set<K extends AppSettingsKey>(key: K, value: AppSettingsState["settings"][K]): void;
    set<T = unknown>(key: string, value: T): void;
    set(key: string, value: unknown): void {
        this.state.update((s) => {
            (s.settings as Record<string, unknown>)[key] = value;
        });
        this._onChanged.send({ key, value });
        this.saveSettingsDebounced();
    }

    /** React hook for reactive reading. Not exposed in script .d.ts. */
    use<K extends AppSettingsKey>(key: K): AppSettingsState["settings"][K] {
        return this.state.use((s) => s.settings[key]);
    }

    get settingsFilePath(): string {
        return this.fileWatcher?.filePath || "";
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    private readonly _onChanged = new Subscription<{ key: string; value: unknown }>();

    private init = async () => {
        await fs.prepareDataFile(settingsFileName, "{}");
        this.fileWatcher = new FileWatcher(
            await fs.dataFileName(settingsFileName),
            this.fileChanged
        );
        await this.loadSettings();
    };

    private fileChanged = () => {
        if (this.skipNextFileChange) {
            this.skipNextFileChange = false;
            return;
        }
        this.loadSettings();
    };

    private loadSettings = async () => {
        const content = parseJSON5(await this.fileWatcher?.getTextContent()) as Record<string, unknown> | undefined;
        if (content) {
            const newSettings = {
                ...defaultAppSettingsState.settings,
                ...content,
            };
            this.state.update((s) => {
                s.settings = newSettings;
            });

            applyTheme(newSettings["theme"]);
        }
    };

    private saveSettings = () => {
        this.skipNextFileChange = true;
        const content = JSON.stringify(this.state.get().settings, null, 4);
        const lines = content.split("\n");

        // Loop backward through lines to insert comments
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];
            const trimmedLine = line.trimStart();

            for (const key of Object.keys(
                settingsComments
            ) as AppSettingsKey[]) {
                if (trimmedLine.startsWith(`"${key}":`)) {
                    const comment = settingsComments[key];
                    if (!comment) break;
                    const indent = line.substring(
                        0,
                        line.length - trimmedLine.length
                    );

                    const commentLines = comment.split("\n");
                    for (let j = commentLines.length - 1; j >= 0; j--) {
                        lines.splice(i, 0, `${indent}// ${commentLines[j]}`);
                    }

                    break;
                }
            }
        }

        const contentWithComments = lines.join("\n");
        fs.saveDataFile(settingsFileName, contentWithComments);
    };

    private saveSettingsDebounced = debounce(this.saveSettings, 300);
}

export const settings = new Settings();
