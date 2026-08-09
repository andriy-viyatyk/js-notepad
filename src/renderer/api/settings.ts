import { debounce } from "../../shared/utils";
import { TGlobalState } from "../core/state/state";
import { Subscription } from "../core/state/events";
import { parseJSON5 } from "../core/utils/parse-utils";
import { fs } from "./fs";
import { FileWatcher } from "../core/utils/file-watcher";
import { applyTheme } from "../theme/themes";
import { defaultSearchableExtensions, defaultMaxFileSize, defaultExcludePatterns } from "../../ipc/search-ipc";
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
    | "search-exclude"
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
    | "window.close-to-tray"
    | "board-vars.file";

// =============================================================================
// State
// =============================================================================

const settingsFileName = "appSettings.json";

/**
 * Header prepended to the saved settings file.
 *
 * The audience for this file's comments is an AI agent as much as a human: an agent helping a
 * new user configure Persephone reaches this file with its ordinary filesystem tools, often
 * before Persephone's MCP server is even on. The header therefore says what the file is, that
 * edits apply live, and where to read more — the three things you cannot infer from a key list.
 */
const settingsFileHeader = [
    "// Persephone settings. JSON5 — comments and trailing commas are allowed.",
    "//",
    "// Edits made here apply immediately: Persephone watches this file and reloads it, so there",
    "// is no need to restart the app. Persephone rewrites the file (and these comments) whenever",
    "// a setting changes in the UI, so any comment you add here will be replaced.",
    "//",
    "// Deleting a key restores its default. Deleting the whole file is safe — it is recreated.",
    "//",
    "// To let an AI agent drive Persephone, set \"mcp.enabled\": true below, then point the agent",
    "// at http://127.0.0.1:7865/mcp (see \"mcp.port\"). Once connected, the agent can call",
    "// read_guide(\"overview\") for everything else.",
    "//",
    "// Docs: https://github.com/andriy-viyatyk/persephone",
].join("\n");

/**
 * Per-key comments written into the settings file above each key.
 *
 * Write them for a reader who is configuring the app from the file itself and cannot see the
 * Settings UI's labels, help text, or controls. State what the setting does, its accepted
 * values and default, and any behavior that a plain "set the value" mental model gets wrong
 * (a change that needs a toggle, a dependency on an external program, a security implication).
 */
const settingsComments: Partial<Record<AppSettingsKey, string>> = {
    "tab-recent-languages":
        "Languages recently chosen from a tab's language menu, most recent first.\nMaintained automatically; they sort to the top of that menu. Safe to trim or clear.",
    "theme": "Application color theme. Applies as soon as this file is saved.\nOne of: default-dark, solarized-dark, monokai, abyss, red, tomorrow-night-blue,\nlight-modern, solarized-light, quiet-light. Default: default-dark.",
    "search-extensions": "File extensions to include in file content search.\nAdd or remove extensions to customize which files are searchable.",
    "search-exclude": "Folders and globs always skipped by file content search.\nA plain name skips any folder with that name; a glob (with / * ?) is matched against the path relative to the search root.\nNever applied to the search root itself — searching inside node_modules works, while nested ones are still skipped.",
    "search-max-file-size": "Maximum file size (in bytes) for file content search.\nFiles larger than this are skipped. Default: 1048576 (1 MB).",
    "browser-profiles": "Browser profiles — isolated sessions, each with its own cookies, storage, and cache.\nArray of profile objects. Use separate profiles to stay signed into several accounts\non the same site at once.",
    "browser-default-profile": "Profile name used when opening a new browser tab.\nMust match a name in \"browser-profiles\". Empty string = the built-in default profile.",
    "browser-default-bookmarks-file": "Absolute path to the .link.json file holding bookmarks for the default browser profile.\nIt is an ordinary Links-editor file and can be opened as a tab.",
    "browser-incognito-bookmarks-file": "Absolute path to the .link.json bookmarks file used in incognito mode.\nKept separate so incognito bookmarks never mix with the normal profile's.",
    "link-open-behavior": "Where external links open from editors.\nOne of: \"default-browser\" (the OS default browser), \"internal-browser\" (the nearest\nPersephone Browser tab). Default: default-browser.",
    "mcp.enabled": "Enable the MCP (Model Context Protocol) HTTP server, so AI agents can drive Persephone.\nBoolean. Default: false. Setting it true here starts the server immediately — no restart.\nThe agent connects to http://127.0.0.1:<mcp.port>/mcp and should start with read_guide(\"overview\").\nThe server listens on loopback only and is never reachable from another machine.",
    "mcp.port": "Port for the MCP HTTP server.\nNumber. Default: 7865. Changing this alone does NOT move a running server —\nset \"mcp.enabled\": false, save, then set it back to true.",
    "mcp.browser-tools.enabled": "Expose the browser_* MCP tools, letting an agent drive the built-in browser,\nboards, and Persephone's own window (pageId: \"app\").\nBoolean. Default: false. A connected agent must reconnect before the tools appear.",
    "mneme.enabled": "Enable Mneme, the local markdown knowledge base with full-text and semantic search.\nBoolean. Default: false. Persephone runs mneme.exe as a sidecar and connects over loopback HTTP.\nMneme exposes its OWN MCP server on \"mneme.port\" — separate from \"mcp.port\" above.",
    "mneme.port": "Port for the Mneme HTTP (MCP) server.\nNumber. Default: 7700. Changing this alone does NOT move a running server —\nset \"mneme.enabled\": false, save, then set it back to true.",
    "script-library.path": "Absolute path to the script library folder — saved scripts and reusable modules.\nEmpty means no library is linked; the Menu Bar's Script Library category then offers\nto pick one. Changing it here re-points the category immediately.",
    "drawing.library-path": "Absolute path to the Excalidraw library folder — reusable shapes for the Drawing editor.\nEmpty uses the default under the app's user-data folder.",
    "pinned-editors": "Editors listed in the '+' new-page menu, in this order.\nArray of creatable item ids, e.g. \"grid-json\", \"draw-view\", \"browser\", \"script-js\".\nThe full set is in the Tools & Editors page; unpinned editors remain available there.",
    "tor.exe-path": "Absolute path to tor.exe. Required for Browser (Tor) mode; empty disables it.\nGet it from the Tor Expert Bundle, or reuse the tor.exe inside a Tor Browser installation.",
    "tor.socks-port": "SOCKS proxy port for Tor.\nNumber. Default: 9050. Change only if 9050 is already in use on this machine.",
    "tor.bookmarks-file": "Path to the .link.json bookmarks file for Browser (Tor) mode.",
    "vlc-path": "Absolute path to vlc.exe, used for formats Chromium cannot decode (AVI, MKV, WMA).\nLeave empty to auto-detect C:\\Program Files\\VideoLAN\\VLC\\vlc.exe.",
    "terminal.command": "Terminal launched by \"Open Terminal here\".\nCommand name or absolute path — pwsh, powershell, cmd, or wt.\nLeave empty to auto-detect on first use (pwsh -> powershell -> cmd).",
    "video-stream.port": "Port for the local video streaming server, which serves media to the player and to VLC.\nNumber. Default: 7866. Change if 7866 is already in use.",
    "visualizer-effect": "Audio visualizer style shown while playing audio files.\nOne of: bars, circular, none. Default: bars.",
    "audio-shuffle": "Shuffle mode for audio playback across a folder, category, or tag set.\nBoolean. Default: false. Toggled by the Shuffle button in the player.",
    "git.enabled": "Enable Git integration — the Git Tree and Git Diff editors.\nBoolean. Default: false, and with it off Persephone performs no git activity at all.\nRequires git installed and on PATH. This is usually why a user cannot find git features.",
    "window.close-to-tray": "Keep Persephone running in the notification tray after its last window is closed.\nBoolean. Default: true — closing the last window only hides it, and the app is\nrestored from the tray icon. Background services (MCP server, Mneme, the launcher\npipe that makes \"Open with persephone\" instant) stay up, which is the point.\nSet false to make closing the last window quit the app outright. The tray icon is\nstill there while the app runs; Quit from it always exits regardless of this setting.",
    "board-vars.file": "Absolute path to the board environment-variables file (.env.json).\nHolds per-board variables and secrets, deliberately OUTSIDE board folders so a board\nfolder can be shared without its secrets. May be password-encrypted via the file's\nencryption menu, in which case its values cannot be read until the user unlocks it.",
};

const defaultAppSettingsState = {
    settings: {
        "tab-recent-languages": ["plaintext"] as string[],
        "theme": "default-dark",
        "search-extensions": defaultSearchableExtensions as string[],
        "search-exclude": defaultExcludePatterns as string[],
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
        "window.close-to-tray": true,
        "board-vars.file": "",
    },
};

type AppSettingsState = typeof defaultAppSettingsState;

/**
 * Value comparison for change detection on reload. Settings hold arrays and objects
 * (`browser-profiles`, `search-extensions`, `pinned-editors`), and every reload re-parses the
 * file into fresh instances — so `!==` would report every one of them as changed on every
 * touch of the file, waking subscribers that reload the script library or reconnect Mneme.
 *
 * Structural values are compared by their JSON form, which is key-order sensitive: reordering
 * keys *within* an object value emits one spurious change, and the next reload agrees again.
 * That is cheap and self-correcting, unlike the alternative of firing on every reload.
 */
function settingsValueEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false;
    return JSON.stringify(a) === JSON.stringify(b);
}

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
        this.loadSettings(true);
    };

    /**
     * Load settings from disk.
     *
     * `emitChanges` is false for the initial load and true for watcher-triggered reloads.
     * The distinction matters: settings that merely get *read* (theme, paths, search config)
     * take effect from the state update alone, but settings that *do* something — starting the
     * MCP server, the browser tools, Mneme — are actuated by subscribers to `onChanged`
     * (see `App.initServices`). Without an emit here, editing `appSettings.json` on disk would
     * flip the value and the Settings UI toggle while the server stayed down: it would look
     * like it worked. Editing the file is the one way an agent can turn MCP on *before* it has
     * MCP, so this path has to work.
     *
     * The initial load must NOT emit — startup already starts MCP/Mneme explicitly after
     * `settings.wait()`, and emitting would start them a second time.
     */
    private loadSettings = async (emitChanges = false) => {
        const content = parseJSON5(await this.fileWatcher?.getTextContent()) as Record<string, unknown> | undefined;
        if (content) {
            const previous = this.state.get().settings as Record<string, unknown>;
            const newSettings = {
                ...defaultAppSettingsState.settings,
                ...content,
            };
            this.state.update((s) => {
                s.settings = newSettings;
            });

            applyTheme(newSettings["theme"]);

            if (emitChanges) {
                const next = newSettings as Record<string, unknown>;
                // Union of both key sets: a key deleted from the file reverts to its default,
                // which is as much a change as an edited one.
                for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
                    if (!settingsValueEqual(previous[key], next[key])) {
                        this._onChanged.send({ key, value: next[key] });
                    }
                }
            }
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

        const contentWithComments = `${settingsFileHeader}\n${lines.join("\n")}`;
        fs.saveDataFile(settingsFileName, contentWithComments);
    };

    private saveSettingsDebounced = debounce(this.saveSettings, 300);
}

export const settings = new Settings();
